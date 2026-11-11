import { Router, Request, Response } from 'express';
import { generalApiRateLimiter } from '../middleware/rateLimit.js';
import { attachSession } from '../middleware/session.js';
import { validateBody, upscaleSchema } from '../middleware/validate.js';
import { MlUnavailableError } from '../services/mlClient.js';
import { consumeDailyQuota, refundDailyQuota, sendRejection } from '../services/rateLimiter.js';
import { recordGuardEvent } from '../services/metrics.js';
import { db } from '../database/db.js';
import { upscaleImage } from '../services/imageGen.js';
import { generateRequestId } from '../utils/crypto.js';
import { writeFileSync, readFileSync } from 'fs';
import { getUploadPath, uploadFileName } from '../utils/storage.js';
import { config } from '../config/env.js';
import path from 'path';

const router = Router();

const MAX_INPUT_SIDE = 512;
const GENERATED_URL = /^\/uploads\/([0-9a-f-]{36}\.png)$/;

function pngSize(buf: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(signature)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function ownedImagePath(sessionId: string, requestId?: string, imageUrl?: string): Promise<string | null> {
  if (requestId) {
    const row = await db.get<{ image_path: string | null }>(
      'SELECT image_path FROM generations WHERE request_id = ? AND session_id = ?',
      [requestId, sessionId]
    );
    return row?.image_path ?? null;
  }
  const match = imageUrl ? GENERATED_URL.exec(imageUrl) : null;
  if (!match) return null;
  const rows = await db.all<{ image_path: string | null }>(
    'SELECT image_path FROM generations WHERE session_id = ? AND image_path IS NOT NULL ORDER BY created_at DESC LIMIT 500',
    [sessionId]
  );
  return rows.find((r) => r.image_path && uploadFileName(r.image_path) === match[1])?.image_path ?? null;
}

router.post('/', generalApiRateLimiter, attachSession, validateBody(upscaleSchema), async (req: Request, res: Response) => {
  let quotaKeys: string[] = [];
  try {
    if (!req.sessionId) return sendRejection(res, 503, 'Could not start a session, try again.', 5);
    const { image_url, request_id, scale } = req.body;

    const stored = await ownedImagePath(req.sessionId, request_id, image_url);
    if (!stored) return res.status(404).json({ error: 'Image not found' });

    let imageBuffer: Buffer;
    try {
      imageBuffer = readFileSync(path.join(config.uploadDir, uploadFileName(stored)));
    } catch {
      return res.status(404).json({ error: 'Image not found' });
    }
    const size = pngSize(imageBuffer);
    if (!size || size.width > MAX_INPUT_SIDE || size.height > MAX_INPUT_SIDE) {
      return res.status(400).json({ error: `Only images up to ${MAX_INPUT_SIDE}x${MAX_INPUT_SIDE} can be upscaled` });
    }

    const quota = await consumeDailyQuota(req.sessionId, (req as any).ipHash);
    if (quota) {
      quotaKeys = quota.keys;
      if (!quota.allowed) {
        await recordGuardEvent('daily_quota', req);
        return sendRejection(res, 429, 'Daily limit reached. It resets at 00:00 UTC.', quota.retryAfter);
      }
    }

    const upscaledBuffer = await upscaleImage(imageBuffer, scale as 2 | 4);

    const upscaleId = generateRequestId();
    const filename = `upscaled_${upscaleId}.png`;
    writeFileSync(getUploadPath(filename), upscaledBuffer);

    res.json({
      request_id: upscaleId,
      image_url: `/uploads/${filename}`,
      scale,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    await refundDailyQuota(quotaKeys).catch(() => undefined);
    if (error instanceof MlUnavailableError) {
      res.setHeader('Retry-After', String(error.retryAfterSec));
      return res.status(503).json({ error: error.message, retry_after: error.retryAfterSec });
    }
    req.log.error({ err: error }, 'upscale failed');
    res.status(500).json({ error: 'Failed to upscale image' });
  }
});

export default router;
