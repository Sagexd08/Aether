import type { Request } from 'express';
import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';

export async function audit(req: Request, action: string, target?: string, detail?: unknown): Promise<void> {
  try {
    await db.run(
      'INSERT INTO audit_log (actor, action, target, ip_hash, request_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin-token', action, target ?? null, (req as any).ipHash ?? null, String(req.id ?? ''), detail ? JSON.stringify(detail) : null]
    );
  } catch (error) {
    logger.error({ err: error, action }, 'failed to write audit log');
  }
}
