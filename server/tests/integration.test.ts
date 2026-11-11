import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readPngText } from '../src/utils/pngText.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

const STUB_DELAY_MS = 600;
const TRAIN_STEP = 4242;

describeDb('api integration', () => {
  let stub: Server;
  let app: import('express').Express;
  let db: typeof import('../src/database/db.js').db;
  let rate: typeof import('../src/services/rateLimiter.js');
  let mlRequests = 0;

  beforeAll(async () => {
    stub = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"healthy"}');
        return;
      }
      mlRequests += 1;
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ image_base64: TINY_PNG.toString('base64'), train_step: TRAIN_STEP }));
      }, STUB_DELAY_MS);
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const port = (stub.address() as AddressInfo).port;

    const { mlHttp } = await import('../src/services/mlClient.js');
    mlHttp.defaults.baseURL = `http://127.0.0.1:${port}`;
    ({ db } = await import('../src/database/db.js'));
    rate = await import('../src/services/rateLimiter.js');
    const { migrate } = await import('../src/database/migrate.js');
    await migrate();
    ({ app } = await import('../src/app.js'));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    const { closeDb } = await import('../src/database/db.js');
    await closeDb();
  });

  beforeEach(async () => {
    await db.run('DELETE FROM rate_limits');
    await db.run("UPDATE jobs SET status = 'cancelled' WHERE status IN ('pending','running')");
    mlRequests = 0;
  });

  const waitForIdle = async () => {
    for (let i = 0; i < 100; i += 1) {
      const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending','running')");
      if (!row || row.n === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const generate = (agent: ReturnType<typeof request.agent>, prompt = 'a red bird on a branch') =>
    agent.post('/api/jobs/generate').send({ positive_prompt: prompt });

  it('applies migrations once and is idempotent', async () => {
    const { migrate } = await import('../src/database/migrate.js');
    expect(await migrate()).toEqual([]);
    const rows = await db.all<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('reports liveness and readiness', async () => {
    expect((await request(app).get('/api/health/live')).status).toBe(200);
    const ready = await request(app).get('/api/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks).toEqual({ database: true, model: true });
  });

  it('rejects blocked prompts with 422 and invalid bodies with 400', async () => {
    const agent = request.agent(app);
    expect((await generate(agent, 'nsfw porn')).status).toBe(422);
    expect((await agent.post('/api/jobs/generate').send({ positive_prompt: '' })).status).toBe(400);
    expect((await agent.post('/api/jobs/generate').send({ positive_prompt: 'x', steps: 99 })).status).toBe(400);
  });

  it('generates an image with a provenance chunk and scopes reads to the owning session', async () => {
    const owner = request.agent(app);
    const other = request.agent(app);
    const created = await generate(owner);
    expect(created.status).toBe(202);
    const jobId = created.body.job_id as string;

    expect((await other.get(`/api/jobs/status/${jobId}`)).status).toBe(403);
    expect((await other.get(`/api/jobs/result/${jobId}`)).status).toBe(403);
    expect((await other.post(`/api/jobs/cancel/${jobId}`)).status).toBe(403);
    expect((await owner.get(`/api/jobs/status/${jobId}`)).status).toBe(200);
    expect((await owner.get('/api/jobs/status/does-not-exist')).status).toBe(404);

    await waitForIdle();
    const result = await owner.get(`/api/jobs/result/${jobId}`);
    expect(result.status).toBe(200);
    const png = readFileSync(path.join(process.env.UPLOAD_DIR!, path.basename(result.body.result.image_url)));
    const provenance = JSON.parse(readPngText(png).Provenance);
    expect(provenance).toMatchObject({ generator: 'Aether AI T2I', train_step: TRAIN_STEP, request_id: result.body.result.request_id });

    const mine = await owner.get('/api/history');
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).toContain(result.body.result.request_id);
    expect(JSON.stringify((await other.get('/api/history')).body)).not.toContain(result.body.result.request_id);
  });

  it('allows one active job per session and refunds the quota on rejection', async () => {
    const agent = request.agent(app);
    const first = await generate(agent);
    const second = await generate(agent);
    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();

    const counters = await db.all<{ count: number }>("SELECT count FROM rate_limits WHERE key LIKE 'quota:%'");
    expect(counters.map((c) => c.count)).toEqual([1]);
    await waitForIdle();
  });

  it('caps concurrent admissions per IP under 10 parallel requests', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => generate(request.agent(app))));
    expect(responses.filter((r) => r.status === 202).length).toBe(2);
    expect(responses.filter((r) => r.status === 429).length).toBe(8);
    await waitForIdle();
    expect(mlRequests).toBeLessThanOrEqual(2);
  });

  it('deletes only the caller data', async () => {
    const owner = request.agent(app);
    const other = request.agent(app);
    const created = await generate(owner);
    await waitForIdle();
    const kept = await generate(other);
    await waitForIdle();
    const deleted = await owner.delete('/api/data/mine');
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted.generations).toBe(1);
    expect((await owner.get(`/api/jobs/status/${created.body.job_id}`)).status).toBe(404);
    expect((await other.get(`/api/jobs/status/${kept.body.job_id}`)).status).toBe(200);
  });

  describe('rate limiter window math', () => {
    it('allows up to the limit then rejects with a positive retryAfter', async () => {
      const results = [];
      for (let i = 0; i < 4; i += 1) results.push(await rate.consume('test:window', 3, 3600));
      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
      expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4]);
      expect(results[3].retryAfter).toBeGreaterThan(0);
      expect(results[3].retryAfter).toBeLessThanOrEqual(3600);
    });

    it('refund lowers the count and never goes below zero', async () => {
      await rate.consume('test:refund', 5, 3600);
      await rate.refund('test:refund', 3600);
      await rate.refund('test:refund', 3600);
      const row = await db.get<{ count: number }>('SELECT count FROM rate_limits WHERE key = ?', ['test:refund']);
      expect(row?.count).toBe(0);
    });

    it('keeps separate keys independent', async () => {
      await rate.consume('test:a', 1, 60);
      expect((await rate.consume('test:b', 1, 60)).allowed).toBe(true);
      expect((await rate.consume('test:a', 1, 60)).allowed).toBe(false);
    });
  });

  describe('auth', () => {
    const credentials = { email: `it-${Date.now()}@example.com`, password: 'correct-horse-battery' };

    it('registers, rejects a wrong password and logs in without leaking the password', async () => {
      const register = await request(app).post('/api/auth/register').send(credentials);
      expect([200, 201, 202]).toContain(register.status);

      const bad = await request(app).post('/api/auth/login').send({ ...credentials, password: 'wrong-password-123' });
      expect(bad.status).toBe(401);

      const login = await request(app).post('/api/auth/login').send(credentials);
      expect(login.status).toBe(200);
      expect(JSON.stringify(login.body)).not.toContain(credentials.password);
    });
  });
});
