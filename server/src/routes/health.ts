import { Router, Request, Response } from 'express';
import { db } from '../database/db.js';
import { mlHttp, breakerStatus } from '../services/mlClient.js';
import { logger } from '../utils/logger.js';

const router = Router();

const databaseUp = () => db.get('SELECT 1').then(() => true, () => false);
const modelUp = () => mlHttp.get('/health', { timeout: 2000 }).then((r) => r.status === 200, () => false);

router.get('/', async (_req: Request, res: Response) => {
  const ok = await databaseUp();
  res.status(ok ? 200 : 503).json({ status: ok ? 'healthy' : 'unhealthy', timestamp: new Date().toISOString() });
});

router.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const [database, model] = await Promise.all([databaseUp(), modelUp()]);
  const ready = database && model;
  if (!ready) logger.warn({ database, model }, 'not ready');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: { database, model }, breaker: breakerStatus().state });
});

export default router;
