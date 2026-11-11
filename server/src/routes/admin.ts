import { fail } from '../utils/httpError.js';
import { Router, Request, Response } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { adminRateLimiter } from '../middleware/rateLimit.js';
import { db } from '../database/db.js';
import { audit } from '../services/audit.js';
import { snapshot } from '../services/metrics.js';
import { breakerStatus } from '../services/mlClient.js';

const router = Router();
router.use(adminRateLimiter);

router.get('/usage', adminAuth, async (req: Request, res: Response) => {
  try {
    await audit(req, 'usage');
    const { days = 7 } = req.query;

    const cutoff = Math.floor(Date.now() / 1000 - parseInt(days as string, 10) * 24 * 60 * 60);

    const usage = await db.all(`
      SELECT 
        endpoint,
        COUNT(*) as count,
        SUM(cost_estimate) as total_cost,
        to_char(to_timestamp(timestamp), 'YYYY-MM-DD') as date
      FROM usage
      WHERE timestamp > ?
      GROUP BY endpoint, date
      ORDER BY date DESC
    `, [cutoff]);

    const topIPs = await db.all(`
      SELECT 
        ip_hash,
        COUNT(*) as request_count
      FROM usage
      WHERE timestamp > ?
      GROUP BY ip_hash
      ORDER BY request_count DESC
      LIMIT 10
    `, [cutoff]);

    res.json({
      usage_by_endpoint: usage,
      top_ips: topIPs,
      period_days: parseInt(days as string, 10),
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/metrics', adminAuth, async (req: Request, res: Response) => {
  try {
    await audit(req, 'metrics');
    res.json({ ...(await snapshot()), breaker: breakerStatus() });
  } catch (error: any) {
    fail(req, res, error);
  }
});

export default router;

