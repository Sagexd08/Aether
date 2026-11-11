import { Router, Request, Response } from 'express';
import { generalApiRateLimiter } from '../middleware/rateLimit.js';
import { attachSession } from '../middleware/session.js';
import { deleteSessionData } from '../services/retention.js';
import { sendRejection } from '../services/rateLimiter.js';
import { fail } from '../utils/httpError.js';

const router = Router();

router.delete('/mine', generalApiRateLimiter, attachSession, async (req: Request, res: Response) => {
  try {
    if (!req.sessionId) return sendRejection(res, 503, 'Could not start a session, try again.', 5);
    const deleted = await deleteSessionData(req.sessionId);
    res.json({ deleted });
  } catch (error) {
    fail(req, res, error);
  }
});

export default router;
