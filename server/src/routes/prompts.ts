import { Router, Request, Response } from 'express';
import { generalApiRateLimiter } from '../middleware/rateLimit.js';
import { validateParams, idParamSchema } from '../middleware/validate.js';
import { attachSession } from '../middleware/session.js';
import { db } from '../database/db.js';
import { config } from '../config/env.js';
import { publicUploadUrl, uploadFileName } from '../utils/storage.js';
import { unlink } from 'fs/promises';
import path from 'path';

const router = Router();

router.get('/:id', generalApiRateLimiter, attachSession, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const g = await db.get('SELECT * FROM generations WHERE request_id = ? AND session_id = ?', [req.params.id, req.sessionId ?? '']);
    if (!g) return res.status(404).json({ error: 'Prompt not found' });

    res.json({
      request_id: g.request_id,
      positive_prompt: g.positive_prompt,
      negative_prompt: g.negative_prompt,
      model: g.model,
      steps: g.steps,
      cfg_scale: g.cfg_scale,
      seed: g.seed,
      width: g.width,
      height: g.height,
      image_url: publicUploadUrl(g.image_path),
      created_at: new Date(g.created_at * 1000).toISOString(),
    });
  } catch (error) {
    req.log.error({ err: error }, 'prompt lookup failed');
    res.status(500).json({ error: 'Failed to load prompt' });
  }
});

router.delete('/:id', generalApiRateLimiter, attachSession, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const removed = await db.get<{ image_path: string | null }>(
      'DELETE FROM generations WHERE request_id = ? AND session_id = ? RETURNING image_path',
      [req.params.id, req.sessionId ?? '']
    );
    if (!removed) return res.status(404).json({ error: 'Prompt not found' });

    if (removed.image_path) {
      await unlink(path.join(config.uploadDir, uploadFileName(removed.image_path))).catch(() => undefined);
    }
    res.json({ message: 'Prompt deleted successfully' });
  } catch (error) {
    req.log.error({ err: error }, 'prompt delete failed');
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

export default router;
