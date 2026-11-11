import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { db } from '../database/db.js';
import { generateRequestId, hashString } from '../utils/crypto.js';
import { consume, sendRejection } from '../services/rateLimiter.js';
import { recordGuardEvent } from '../services/metrics.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      sessionHash?: string;
    }
  }
}

const NEW_SESSIONS_PER_IP_PER_HOUR = 10;
const IDLE_SESSION_DAYS = 30;
const COOKIE_MAX_AGE_MS = IDLE_SESSION_DAYS * 24 * 60 * 60 * 1000;
const PREF_COLUMNS = new Set(['default_model', 'ui_mode', 'experience_level', 'preferred_resolution']);

export async function attachSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.sessionId;
    if (typeof token === 'string' && token.length > 0 && token.length <= 128) {
      const sessionHash = hashString(token);
      const session = await db.get('SELECT id FROM sessions WHERE session_hash = ?', [sessionHash]);
      if (session) {
        await db.run('UPDATE sessions SET last_activity = strftime("%s", "now") WHERE id = ?', [session.id]);
        req.sessionId = session.id;
        req.sessionHash = sessionHash;
        return next();
      }
    }

    const ipHash = (req as any).ipHash as string;
    const created = await consume(`sess_new:${ipHash}`, NEW_SESSIONS_PER_IP_PER_HOUR, 3600);
    if (!created.allowed) {
      void recordGuardEvent('session_create_limit', req);
      return sendRejection(res, 429, 'Too many new sessions from this address, try again later.', created.retryAfter);
    }

    const newToken = randomBytes(32).toString('hex');
    const newSessionId = generateRequestId();
    const newSessionHash = hashString(newToken);

    await db.run('INSERT INTO sessions (id, session_hash, ip_hash) VALUES (?, ?, ?)', [newSessionId, newSessionHash, ipHash]);
    await db.run('INSERT INTO session_preferences (session_id) VALUES (?) ON CONFLICT DO NOTHING', [newSessionId]);

    req.sessionId = newSessionId;
    req.sessionHash = newSessionHash;
    res.cookie('sessionId', newToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
    });
    next();
  } catch (error) {
    logger.error({ err: error }, 'session middleware failed');
    next();
  }
}

export async function purgeIdleSessions(): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - IDLE_SESSION_DAYS * 24 * 3600;
  const idle = `SELECT id FROM sessions WHERE last_activity < ? AND user_id IS NULL
    AND id NOT IN (SELECT session_id FROM jobs) AND id NOT IN (SELECT session_id FROM generations)`;
  await db.run(`DELETE FROM session_preferences WHERE session_id IN (${idle})`, [cutoff]);
  return (await db.run(`DELETE FROM sessions WHERE id IN (${idle})`, [cutoff])).changes;
}

export function getSessionPreferences(sessionId: string) {
  return db.get('SELECT * FROM session_preferences WHERE session_id = ?', [sessionId]);
}

export async function updateSessionPreferences(sessionId: string, prefs: Partial<{
  default_model: string;
  ui_mode: string;
  experience_level: string;
  preferred_resolution: string;
}>) {
  const entries = Object.entries(prefs).filter(([k, v]) => v !== undefined && PREF_COLUMNS.has(k));
  if (entries.length === 0) return;

  await db.run(`
    UPDATE session_preferences
    SET ${entries.map(([k]) => `${k} = ?`).join(', ')}, updated_at = strftime("%s", "now")
    WHERE session_id = ?
  `, [...entries.map(([, v]) => v), sessionId]);
}
