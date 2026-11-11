import { app } from './app.js';
import { jobQueue } from './services/jobQueue.js';
import { closeDb } from './database/db.js';
import { config } from './config/env.js';
import { migrate } from './database/migrate.js';
import { logger } from './utils/logger.js';

async function start(): Promise<void> {
  await migrate();
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
