import { readdir, stat, unlink } from 'fs/promises';
import path from 'path';
import { db } from '../database/db.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { uploadFileName } from '../utils/storage.js';

const DAY_SEC = 86_400;
const GUARD_EVENT_DAYS = 90;
const AUDIT_LOG_DAYS = 365;
const UPLOAD_FILE = /^(upscaled_)?[0-9a-f-]{36}\.png$/;

const removeFile = (file: string) => unlink(path.join(config.uploadDir, file)).catch(() => undefined);

export async function purgeExpired(): Promise<{ generations: number; files: number }> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - config.uploadRetentionDays * DAY_SEC;

  const expired = await db.all<{ image_path: string | null }>('SELECT image_path FROM generations WHERE created_at < ?', [cutoff]);
  for (const row of expired) if (row.image_path) await removeFile(uploadFileName(row.image_path));
  const { changes: generations } = await db.run('DELETE FROM generations WHERE created_at < ?', [cutoff]);

  let files = 0;
  for (const name of await readdir(config.uploadDir).catch(() => [] as string[])) {
    if (!UPLOAD_FILE.test(name)) continue;
    const info = await stat(path.join(config.uploadDir, name)).catch(() => null);
    if (info && info.mtimeMs / 1000 < cutoff) {
      await removeFile(name);
      files += 1;
    }
  }

  await db.run('DELETE FROM guard_events WHERE created_at < ?', [now - GUARD_EVENT_DAYS * DAY_SEC]);
  await db.run('DELETE FROM audit_log WHERE created_at < ?', [now - AUDIT_LOG_DAYS * DAY_SEC]);

  logger.info({ generations, files }, 'retention purge');
  return { generations, files };
}

export async function deleteSessionData(sessionId: string): Promise<{ generations: number; jobs: number }> {
  const owner = await db.get<{ user_id: string | null }>('SELECT user_id FROM sessions WHERE id = ?', [sessionId]);
  const sessions = owner?.user_id
    ? (await db.all<{ id: string }>('SELECT id FROM sessions WHERE user_id = ?', [owner.user_id])).map((s) => s.id)
    : [sessionId];
  if (!sessions.includes(sessionId)) sessions.push(sessionId);

  const rows = await db.all<{ image_path: string | null }>(
    'SELECT image_path FROM generations WHERE session_id = ANY(?::text[])',
    [sessions]
  );
  for (const row of rows) if (row.image_path) await removeFile(uploadFileName(row.image_path));

  const { changes: generations } = await db.run('DELETE FROM generations WHERE session_id = ANY(?::text[])', [sessions]);
  const { changes: jobs } = await db.run(
    "DELETE FROM jobs WHERE session_id = ANY(?::text[]) AND status IN ('completed', 'failed', 'cancelled')",
    [sessions]
  );
  return { generations, jobs };
}
