import type { Request } from 'express';
import { db } from '../database/db.js';
import { logger } from '../utils/logger.js';

export async function recordGuardEvent(reason: string, req: Request, detail?: string): Promise<void> {
  try {
    await db.run('INSERT INTO guard_events (reason, session_id, ip_hash, request_id, detail) VALUES (?, ?, ?, ?, ?)', [
      reason,
      req.sessionId ?? null,
      (req as any).ipHash ?? null,
      String(req.id ?? ''),
      detail ?? null,
    ]);
  } catch (error) {
    logger.error({ err: error, reason }, 'failed to record guard event');
  }
}

const LATENCY_WINDOW = 500;
const latenciesMs: number[] = [];
let completed = 0;
let failed = 0;

export function recordJobResult(durationMs: number, ok: boolean): void {
  if (ok) completed += 1;
  else failed += 1;
  latenciesMs.push(durationMs);
  if (latenciesMs.length > LATENCY_WINDOW) latenciesMs.shift();
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export async function snapshot() {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const [queue, rejects] = await Promise.all([
    db.all<{ status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM jobs WHERE status IN ('pending', 'running') GROUP BY status"
    ),
    db.all<{ reason: string; n: number }>(
      `SELECT reason, COUNT(*) AS n FROM guard_events
       WHERE created_at > extract(epoch from now())::bigint - 86400 GROUP BY reason ORDER BY n DESC`
    ),
  ]);
  return {
    queue_depth: Object.fromEntries(queue.map((r) => [r.status, r.n])),
    jobs_since_boot: { completed, failed },
    latency_ms: { samples: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) },
    rejects_last_24h: Object.fromEntries(rejects.map((r) => [r.reason, r.n])),
  };
}
