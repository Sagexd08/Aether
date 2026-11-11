import { db, transaction } from '../database/db.js';
import { generateRequestId } from '../utils/crypto.js';
import { generateImage } from './imageGen.js';
import { MlUnavailableError } from './mlClient.js';
import { writeFileSync } from 'fs';
import { getUploadPath } from '../utils/storage.js';
import { logger } from '../utils/logger.js';
import { recordJobResult } from './metrics.js';
import { purgeExpiredCounters } from './rateLimiter.js';
import { purgeIdleSessions } from '../middleware/session.js';
import { purgeExpired } from './retention.js';

const MAX_QUEUE_DEPTH = 20;
const MAX_ACTIVE_PER_SESSION = 1;
const MAX_ACTIVE_PER_IP = 2;

export type Admission =
  | { ok: true; jobId: string }
  | { ok: false; status: 429 | 503; reason: string; error: string; retryAfter: number };

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType = 'generate' | 'upscale' | 'enhance';

export interface JobParams {
  positive_prompt: string;
  negative_prompt?: string;
  model?: string;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  width?: number;
  height?: number;
}

export interface Job {
  id: string;
  session_id: string;
  status: JobStatus;
  type: JobType;
  params: JobParams;
  progress: number;
  progress_message?: string;
  error_message?: string;
  original_prompt?: string;
  enhanced_prompt?: string;
  result?: {
    request_id: string;
    image_url: string;
  };
  created_at: number;
  updated_at: number;
  ip_hash?: string;
}

const PROGRESS_TICK_MS = 2000;
const PROGRESS_CEILING = 80;

function rowToJob(row: any): Job {
  return {
    id: row.id,
    session_id: row.session_id,
    status: row.status,
    type: row.type,
    params: JSON.parse(row.params),
    progress: row.progress,
    progress_message: row.progress_message,
    error_message: row.error_message,
    original_prompt: row.original_prompt ?? undefined,
    enhanced_prompt: row.enhanced_prompt ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ip_hash: row.ip_hash ?? undefined,
  };
}

class JobQueue {
  private runningJobs = new Map<string, AbortController>();
  private maxConcurrent = 1;
  private processing = false;
  private rerunRequested = false;
  private reaper?: NodeJS.Timeout;

  async reapStuck(staleSeconds = 600): Promise<number> {
    const live = [...this.runningJobs.keys()];
    const rows = await db.all(
      `UPDATE jobs SET status = 'failed', error_message = 'Job timed out or server restarted',
         updated_at = strftime('%s', 'now')
       WHERE status = 'running' AND updated_at < strftime('%s', 'now') - ?
         AND NOT (id = ANY(?::text[]))
       RETURNING id`,
      [staleSeconds, live]
    );
    return rows.length;
  }

  startReaper(): void {
    let lastRetention = 0;
    this.reaper = setInterval(() => {
      this.reapStuck().catch((err) => logger.error({ err }, 'job reaper failed'));
      purgeExpiredCounters().catch((err) => logger.error({ err }, 'rate-limit purge failed'));
      purgeIdleSessions().catch((err) => logger.error({ err }, 'session purge failed'));
      if (Date.now() - lastRetention > 3_600_000) {
        lastRetention = Date.now();
        purgeExpired().catch((err) => logger.error({ err }, 'retention purge failed'));
      }
    }, 60_000);
    this.reaper.unref();
  }

  async drain(timeoutMs: number): Promise<void> {
    if (this.reaper) clearInterval(this.reaper);
    this.maxConcurrent = 0;
    const deadline = Date.now() + timeoutMs;
    while (this.runningJobs.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    for (const c of this.runningJobs.values()) c.abort();
  }

  async createJob(
    sessionId: string,
    ipHash: string,
    type: JobType,
    params: JobParams,
    originalPrompt: string,
    enhancedPrompt?: string,
    safetyFlags?: unknown
  ): Promise<Admission> {
    const jobId = generateRequestId();

    const admission = await transaction<Admission>(async (tx) => {
      await tx.get('SELECT pg_advisory_xact_lock(7001)');
      const global = await tx.get<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending', 'running')");
      if ((global?.n ?? 0) >= MAX_QUEUE_DEPTH) {
        return { ok: false, status: 503, reason: 'queue_full', error: 'The queue is full, try again shortly.', retryAfter: 15 };
      }
      const mine = await tx.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM jobs WHERE session_id = ? AND status IN ('pending', 'running')",
        [sessionId]
      );
      if ((mine?.n ?? 0) >= MAX_ACTIVE_PER_SESSION) {
        return { ok: false, status: 429, reason: 'session_busy', error: 'You already have an image generating. Wait for it to finish.', retryAfter: 5 };
      }
      const fromIp = await tx.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM jobs WHERE ip_hash = ? AND status IN ('pending', 'running')",
        [ipHash]
      );
      if ((fromIp?.n ?? 0) >= MAX_ACTIVE_PER_IP) {
        return { ok: false, status: 429, reason: 'ip_busy', error: 'Too many images are generating from your network. Wait for one to finish.', retryAfter: 10 };
      }
      await tx.run(`
        INSERT INTO jobs (id, session_id, ip_hash, type, params, status, original_prompt, enhanced_prompt, safety_flags, progress, progress_message)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, 'Waiting in queue...')
      `, [jobId, sessionId, ipHash, type, JSON.stringify(params), originalPrompt, enhancedPrompt || null, safetyFlags ? JSON.stringify(safetyFlags) : null]);
      return { ok: true, jobId };
    });

    if (admission.ok) void this.processQueue();

    return admission;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const controller = this.runningJobs.get(jobId);
    if (controller) {
      controller.abort();
      this.runningJobs.delete(jobId);
    }

    const result = await db.run(`
      UPDATE jobs
      SET status = 'cancelled', updated_at = strftime('%s', 'now')
      WHERE id = ? AND status IN ('pending', 'running')
    `, [jobId]);

    return result.changes > 0;
  }

  async getJob(jobId: string): Promise<Job | null> {
    const row = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
    return row ? rowToJob(row) : null;
  }

  async getSessionJobs(sessionId: string, limit: number = 10): Promise<Job[]> {
    const rows = await db.all(`
      SELECT * FROM jobs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [sessionId, limit]);

    return rows.map(rowToJob);
  }

  async updateJobProgress(jobId: string, progress: number, message: string): Promise<void> {
    await db.run(`
      UPDATE jobs
      SET progress = ?, progress_message = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `, [progress, message, jobId]);
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      this.rerunRequested = true;
      return;
    }
    this.processing = true;
    try {
      do {
        this.rerunRequested = false;
        while (this.runningJobs.size < this.maxConcurrent) {
          const claimed = await db.get(`
            UPDATE jobs
            SET status = 'running', progress = 5, progress_message = 'Initializing...', updated_at = strftime('%s', 'now')
            WHERE id = (
              SELECT id FROM jobs
              WHERE status = 'pending'
              ORDER BY created_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            )
            RETURNING id, params, type
          `);
          if (!claimed) break;

          this.executeJob(claimed.id, JSON.parse(claimed.params), claimed.type).catch((error) =>
            logger.error({ err: error, jobId: claimed.id }, 'job crashed')
          );
        }
      } while (this.rerunRequested);
    } finally {
      this.processing = false;
    }
  }

  private async executeJob(jobId: string, params: JobParams, type: JobType) {
    const controller = new AbortController();
    this.runningJobs.set(jobId, controller);
    const startedAt = Date.now();
    let ok = false;

    try {
      if (type === 'generate') {
        await this.executeGenerateJob(jobId, params, controller.signal);
      }
      ok = true;

      await db.run(`
        UPDATE jobs
        SET status = 'completed', progress = 100, progress_message = 'Complete', completed_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now')
        WHERE id = ? AND status = 'running'
      `, [jobId]);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'AbortError') {
        await db.run(`
          UPDATE jobs
          SET status = 'cancelled', error_message = 'Job was cancelled', updated_at = strftime('%s', 'now')
          WHERE id = ?
        `, [jobId]);
      } else {
        await db.run(`
          UPDATE jobs
          SET status = 'failed', error_message = ?, updated_at = strftime('%s', 'now')
          WHERE id = ?
        `, [error instanceof MlUnavailableError ? 'The image model is temporarily unavailable.' : 'Image generation failed.', jobId]);
        logger.error({ err: error, jobId }, 'job failed');
      }
    } finally {
      recordJobResult(Date.now() - startedAt, ok);
      logger.info({ jobId, ok, ms: Date.now() - startedAt }, 'job finished');
      this.runningJobs.delete(jobId);
      void this.processQueue();
    }
  }

  private async executeGenerateJob(jobId: string, params: JobParams, signal: AbortSignal) {
    await this.updateJobProgress(jobId, 10, 'Enhancing prompt...');

    await this.updateJobProgress(jobId, 20, 'Generating image...');

    const progressInterval = setInterval(async () => {
      try {
        const currentJob = await this.getJob(jobId);
        if (currentJob && currentJob.progress < PROGRESS_CEILING) {
          const next = Math.min(currentJob.progress + Math.random() * 15, PROGRESS_CEILING);
          await this.updateJobProgress(jobId, Math.floor(next), 'Generating image...');
        }
      } catch (error) {
        logger.error({ err: error }, 'progress update failed');
      }
    }, PROGRESS_TICK_MS);

    try {
      const imageBuffer = await generateImage({
        prompt: params.positive_prompt,
        steps: params.steps,
        cfg_scale: params.cfg_scale,
        seed: params.seed,
        signal,
      });

      clearInterval(progressInterval);

      if (signal.aborted) {
        throw new Error('AbortError');
      }

      await this.updateJobProgress(jobId, 85, 'Saving image...');

      const requestId = generateRequestId();
      const filename = `${requestId}.png`;
      const imagePath = getUploadPath(filename);
      writeFileSync(imagePath, imageBuffer);

      const job = await this.getJob(jobId);
      if (job) {
        await db.run(`
          INSERT INTO generations (
            id, job_id, request_id, session_id, ip_hash, positive_prompt, negative_prompt,
            model, steps, cfg_scale, seed, width, height, image_path, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          generateRequestId(),
          jobId,
          requestId,
          job.session_id,
          job.ip_hash ?? 'unknown',
          params.positive_prompt,
          params.negative_prompt || null,
          params.model || 'sd15',
          params.steps || 20,
          params.cfg_scale ?? 3,
          params.seed ?? null,
          params.width || 512,
          params.height || 512,
          imagePath,
          JSON.stringify({ job_id: jobId, original_prompt: job.original_prompt, enhanced_prompt: job.enhanced_prompt }),
        ]);
      }

      await this.updateJobProgress(jobId, 95, 'Finalizing...');

      await db.run(`
        UPDATE jobs
        SET result = ?
        WHERE id = ?
      `, [JSON.stringify({ request_id: requestId, image_url: `/uploads/${filename}` }), jobId]);
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }
}

const jobQueue = new JobQueue();
export { jobQueue };
