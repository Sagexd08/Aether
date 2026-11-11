import { Router, Request, Response } from 'express';
import { generalApiRateLimiter } from '../middleware/rateLimit.js';
import { attachSession } from '../middleware/session.js';
import { validateQuery, pageQuerySchema } from '../middleware/validate.js';
import { fail } from '../utils/httpError.js';
import { db } from '../database/db.js';
import { publicUploadUrl } from '../utils/storage.js';

const router = Router();

router.get('/', generalApiRateLimiter, attachSession, validateQuery(pageQuerySchema), async (req: Request, res: Response) => {
  try {
    if (!req.sessionId) return res.status(503).json({ error: 'Could not start a session, try again.' });
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };

    const rows = await db.all(
      'SELECT * FROM generations WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.sessionId, limit, offset]
    );
    const total = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM generations WHERE session_id = ?', [req.sessionId]);

    res.json({
      results: rows.map((g: any) => ({
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
      })),
      total: Number(total?.n ?? rows.length),
    });
  } catch (error) {
    fail(req, res, error);
  }
});

export default router;
