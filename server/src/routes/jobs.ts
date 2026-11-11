import { validateBody, validateQuery, generateSchema, pageQuerySchema } from '../middleware/validate.js';
import { randomInt } from 'crypto';
import { fail } from '../utils/httpError.js';
import { Router, Request, Response } from 'express';
import { generalApiRateLimiter, generateIpLimiter, generateSessionLimiter } from '../middleware/rateLimit.js';
import { attachSession } from '../middleware/session.js';
import { jobQueue } from '../services/jobQueue.js';
import { db } from '../database/db.js';
import { checkPrompt } from '../services/promptPolicy.js';
import { consumeDailyQuota, refundDailyQuota, sendRejection } from '../services/rateLimiter.js';
import { recordGuardEvent } from '../services/metrics.js';
import { breakerRetryAfter } from '../services/mlClient.js';
import { logger } from '../utils/logger.js';
import { publicUploadUrl } from '../utils/storage.js';

const router = Router();

router.post('/generate', generalApiRateLimiter, generateIpLimiter, attachSession, generateSessionLimiter, validateBody(generateSchema), async (req: Request, res: Response) => {
  let quotaKeys: string[] = [];
  try {
    if (!req.sessionId) return sendRejection(res, 503, 'Could not start a session, try again.', 5);

    const rawPrompt: string = req.body.positive_prompt;
    const policy = checkPrompt(rawPrompt);
    if (!policy.allowed) {
      await recordGuardEvent(`prompt_blocked:${policy.flags.join('+')}`, req);
      return res.status(422).json({ error: 'This prompt is not allowed.', flags: policy.flags });
    }
    if (!policy.normalized) return res.status(400).json({ error: 'positive_prompt: must contain visible text' });
    req.body.positive_prompt = policy.normalized;

    const mlWait = breakerRetryAfter();
    if (mlWait > 0) {
      await recordGuardEvent('ml_unavailable', req);
      return sendRejection(res, 503, 'The image model is temporarily unavailable.', mlWait);
    }

    let quota: Awaited<ReturnType<typeof consumeDailyQuota>>;
    try {
      quota = await consumeDailyQuota(req.sessionId, (req as any).ipHash);
    } catch (err) {
      logger.error({ err }, 'quota check failed closed');
      return sendRejection(res, 503, 'Temporarily unavailable, please try again.', 5);
    }
    if (quota) {
      quotaKeys = quota.keys;
      if (!quota.allowed) {
        await recordGuardEvent('daily_quota', req);
        return sendRejection(res, 429, 'Daily generation limit reached. It resets at 00:00 UTC.', quota.retryAfter);
      }
    }

    const {
      positive_prompt,
      negative_prompt,
      model = 'sd15',
      steps = 20,
      cfg_scale = 3,
      seed,
      width = 512,
      height = 512,
    } = req.body;

    const sessionId = req.sessionId!;

    const enhancedPrompt = undefined;

    const admission = await jobQueue.createJob(
      sessionId,
      (req as any).ipHash,
      'generate',
      {
        positive_prompt,
        negative_prompt,
        model,
        steps,
        cfg_scale,
        seed: seed ?? randomInt(0, 2 ** 31),
        width,
        height,
      },
      positive_prompt,
      enhancedPrompt,
      { prompt_normalized: policy.normalized !== rawPrompt, flags: policy.flags }
    );

    if (!admission.ok) {
      await refundDailyQuota(quotaKeys).catch(() => undefined);
      await recordGuardEvent(admission.reason, req);
      return sendRejection(res, admission.status, admission.error, admission.retryAfter);
    }

    res.status(202).json({
      job_id: admission.jobId,
      status: 'pending',
      message: 'Job queued successfully',
    });
  } catch (error: any) {
    await refundDailyQuota(quotaKeys).catch(() => undefined);
    logger.error({ err: error, reqId: req.id }, 'job creation failed');
    res.status(500).json({ error: 'Failed to create job' });
  }
});

router.get('/status/:jobId', generalApiRateLimiter, attachSession, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const sessionId = req.sessionId;

    const job = await jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.session_id !== sessionId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      job_id: job.id,
      status: job.status,
      progress: job.progress,
      progress_message: job.progress_message,
      error_message: job.error_message,
      created_at: new Date(job.created_at * 1000).toISOString(),
      updated_at: new Date(job.updated_at * 1000).toISOString(),
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/result/:jobId', generalApiRateLimiter, attachSession, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const sessionId = req.sessionId;

    const job = await jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.session_id !== sessionId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        job_id: job.id,
        status: job.status,
        message: job.status === 'failed' ? job.error_message : 'Job not yet complete',
      });
    }

    res.json({
      job_id: job.id,
      status: job.status,
      result: job.result,
      created_at: new Date(job.created_at * 1000).toISOString(),
      completed_at: job.updated_at ? new Date(job.updated_at * 1000).toISOString() : null,
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.post('/cancel/:jobId', generalApiRateLimiter, attachSession, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const sessionId = req.sessionId;

    const job = await jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.session_id !== sessionId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cancelled = await jobQueue.cancelJob(jobId);

    if (!cancelled) {
      return res.status(400).json({ error: 'Job cannot be cancelled (already completed or failed)' });
    }

    res.json({
      job_id: jobId,
      status: 'cancelled',
      message: 'Job cancelled successfully',
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/recent', generalApiRateLimiter, attachSession, validateQuery(pageQuerySchema), async (req: Request, res: Response) => {
  try {
    const sessionId = req.sessionId!;
    const { limit } = req.query as unknown as { limit: number };

    const jobs = await jobQueue.getSessionJobs(sessionId, limit);

    res.json({
      jobs: jobs.map(job => ({
        job_id: job.id,
        status: job.status,
        type: job.type,
        progress: job.progress,
        result: job.result,
        created_at: new Date(job.created_at * 1000).toISOString(),
      })),
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/history', generalApiRateLimiter, attachSession, validateQuery(pageQuerySchema), async (req: Request, res: Response) => {
  try {
    const sessionId = req.sessionId!;
    const { limit } = req.query as unknown as { limit: number };

    const generations = await db.all(`
      SELECT * FROM generations 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [sessionId, limit]);

    res.json({
      generations: generations.map(g => ({
        request_id: g.request_id,
        job_id: g.job_id,
        image_url: publicUploadUrl(g.image_path),
        positive_prompt: g.positive_prompt,
        negative_prompt: g.negative_prompt,
        model: g.model,
        steps: g.steps,
        cfg_scale: g.cfg_scale,
        seed: g.seed,
        width: g.width,
        height: g.height,
        created_at: new Date(g.created_at * 1000).toISOString(),
      })),
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

router.get('/transparency/:requestId', generalApiRateLimiter, attachSession, async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const sessionId = req.sessionId;

    const generation = await db.get(`
      SELECT g.*, j.original_prompt, j.enhanced_prompt, j.safety_flags
      FROM generations g
      LEFT JOIN jobs j ON g.job_id = j.id
      WHERE g.request_id = ?
    `, [requestId]);

    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }

    if (generation.session_id !== sessionId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      request_id: generation.request_id,
      original_prompt: generation.original_prompt,
      enhanced_prompt: generation.enhanced_prompt,
      final_prompt: generation.positive_prompt,
      negative_prompt: generation.negative_prompt,
      safety_flags: generation.safety_flags ? JSON.parse(generation.safety_flags) : null,
      modifications: generation.enhanced_prompt && generation.enhanced_prompt !== generation.original_prompt
        ? 'Prompt was enhanced for better results'
        : 'No modifications applied',
    });
  } catch (error: any) {
    fail(req, res, error);
  }
});

export default router;
