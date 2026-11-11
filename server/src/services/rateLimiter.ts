import type { Request, Response, NextFunction } from 'express';
import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { recordGuardEvent } from './metrics.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface ConsumeResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfter: number;
}

export async function consume(key: string, limit: number, windowSec: number): Promise<ConsumeResult> {
  const now = nowSeconds();
  const windowStart = now - (now % windowSec);
  const row = await db.get<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key, windowStart]
  );
  const count = row?.count ?? 1;
  return { allowed: count <= limit, count, limit, retryAfter: Math.max(1, windowStart + windowSec - now) };
}

export async function refund(key: string, windowSec: number): Promise<void> {
  const now = nowSeconds();
  await db.run('UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = ? AND window_start = ?', [
    key,
    now - (now % windowSec),
  ]);
}

export async function purgeExpiredCounters(): Promise<number> {
  const { changes } = await db.run('DELETE FROM rate_limits WHERE window_start < ?', [nowSeconds() - 2 * 24 * 3600]);
  return changes;
}

interface LimiterOptions {
  name: string;
  limit: number;
  windowSec: number;
  keyFor: (req: Request) => string | undefined;
  failClosed?: boolean;
}

export function sendRejection(res: Response, status: 429 | 503, error: string, retryAfter: number): void {
  res.setHeader('Retry-After', String(retryAfter));
  res.status(status).json({ error, retry_after: retryAfter });
}

export function pgRateLimit({ name, limit, windowSec, keyFor, failClosed = false }: LimiterOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = keyFor(req);
    if (!identity) return next();
    try {
      const result = await consume(`${name}:${identity}`, limit, windowSec);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - result.count)));
      if (!result.allowed) {
        void recordGuardEvent(`rate_limit:${name}`, req);
        return sendRejection(res, 429, 'Too many requests, please slow down.', result.retryAfter);
      }
    } catch (error) {
      logger.error({ err: error, limiter: name, failClosed }, 'rate limiter database error');
      if (failClosed) return sendRejection(res, 503, 'Temporarily unavailable, please try again.', 5);
    }
    next();
  };
}

const DAILY_QUOTA: Record<string, number> = { anonymous: 20, free: 50, pro: 500 };
const ANONYMOUS_IP_DAILY_QUOTA = 40;
const DAY_SEC = 86_400;

export interface QuotaResult {
  allowed: boolean;
  retryAfter: number;
  keys: string[];
}

export async function consumeDailyQuota(sessionId: string, ipHash: string): Promise<QuotaResult | null> {
  const row = await db.get<{ user_id: string | null; plan: string | null }>(
    'SELECT s.user_id, u.plan FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?',
    [sessionId]
  );
  const plan = row?.user_id ? row.plan ?? 'free' : 'anonymous';
  if (plan === 'admin') return null;
  const checks: Array<[string, number]> = row?.user_id
    ? [[`quota:${row.user_id}`, DAILY_QUOTA[plan] ?? DAILY_QUOTA.free]]
    : [[`quota:${sessionId}`, DAILY_QUOTA.anonymous], [`quota_ip:${ipHash}`, ANONYMOUS_IP_DAILY_QUOTA]];
  const results = await Promise.all(checks.map(([key, limit]) => consume(key, limit, DAY_SEC)));
  const keys = checks.map(([key]) => key);
  const allowed = results.every((r) => r.allowed);
  if (!allowed) await refundDailyQuota(keys);
  return { allowed, retryAfter: Math.max(...results.map((r) => r.retryAfter)), keys };
}
export const refundDailyQuota = (keys: string[]) => Promise.all(keys.map((k) => refund(k, DAY_SEC))).then(() => undefined);

export const ipKey =(req: Request): string => (req as any).ipHash ?? req.ip ?? 'unknown';
export const sessionKey = (req: Request): string | undefined => req.sessionId;
