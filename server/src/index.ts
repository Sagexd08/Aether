import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { jobQueue } from './services/jobQueue.js';
import { closeDb } from './database/db.js';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { initializeDatabase } from './database/schema.js';
import { ensureDirectories } from './utils/storage.js';
import { attachIPHash } from './middleware/ipHash.js';

import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from './utils/logger.js';

import historyRouter from './routes/history.js';
import upscaleRouter from './routes/upscale.js';
import promptsRouter from './routes/prompts.js';
import stylesRouter from './routes/styles.js';
import enhancePromptRouter from './routes/enhancePrompt.js';
import adminRouter from './routes/admin.js';
import healthRouter from './routes/health.js';
import jobsRouter from './routes/jobs.js';
import authRouter from './routes/auth.js';
import dataRouter from './routes/data.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

ensureDirectories();

app.set('trust proxy', config.trustProxy);
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const supplied = req.headers['x-request-id'];
      const id = typeof supplied === 'string' && /^[\w-]{8,64}$/.test(supplied) ? supplied : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(attachIPHash);

app.use('/uploads', express.static(config.uploadDir));

app.use('/api/history', historyRouter);
app.use('/api/upscale', upscaleRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/styles', stylesRouter);
app.use('/api/enhance-prompt', enhancePromptRouter);
app.use('/api/admin', adminRouter);
app.use('/api/health', healthRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/auth', authRouter);
app.use('/api/data', dataRouter);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.log.error({ err }, 'unhandled error');
  const status = err.status || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    request_id: req.id,
  });
});

async function start(): Promise<void> {
  await initializeDatabase();
  await jobQueue.reapStuck(0);
  jobQueue.startReaper();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, uploads: config.uploadDir }, 'Aether AI server running');
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(1), 20_000).unref();
    server.close();
    jobQueue
      .drain(10_000)
      .then(() => closeDb())
      .catch((err) => logger.error({ err }, 'shutdown error'))
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error({ err: error }, 'failed to start server');
  process.exit(1);
});

