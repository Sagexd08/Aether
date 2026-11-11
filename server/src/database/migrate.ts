import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, execScript } from './db.js';
import { logger } from '../utils/logger.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

export async function migrate(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await execScript('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint))');
  const applied = new Set((await db.all<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => MIGRATION_FILE.test(f)).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await execScript(`${sql}\nINSERT INTO schema_migrations (name) VALUES ('${file}');`);
    logger.info({ migration: file }, 'migration applied');
    ran.push(file);
  }
  return ran;
}
