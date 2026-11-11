import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = enabled ? describe : describe.skip;

describeDb('api routes', () => {
  let stub: Server;
  let app: import('express').Express;
  let db: typeof import('../src/database/db.js').db;
  let retention: typeof import('../src/services/retention.js');

  beforeAll(async () => {
    stub = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200).end('{}');
        return;
      }
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ image_base64: TINY_PNG.toString('base64'), train_step: 1 }));
      }, 150);
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { mlHttp } = await import('../src/services/mlClient.js');
    mlHttp.defaults.baseURL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    ({ db } = await import('../src/database/db.js'));
    retention = await import('../src/services/retention.js');
    await (await import('../src/database/migrate.js')).migrate();
    ({ app } = await import('../src/app.js'));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    await (await import('../src/database/db.js')).closeDb();
  });

  beforeEach(async () => {
    await db.run('DELETE FROM rate_limits');
    await db.run("UPDATE jobs SET status = 'cancelled' WHERE status IN ('pending','running')");
  });

  const idle = async () => {
    for (let i = 0; i < 100; i += 1) {
      const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending','running')");
      if (!row || row.n === 0) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  const generated = async (agent: ReturnType<typeof request.agent>) => {
    const created = await agent.post('/api/jobs/generate').send({ positive_prompt: 'a red bird on a branch' });
    expect(created.status).toBe(202);
    await idle();
    const result = await agent.get(`/api/jobs/result/${created.body.job_id}`);
    expect(result.status).toBe(200);
    return { jobId: created.body.job_id as string, requestId: result.body.result.request_id as string };
  };

  describe('auth lifecycle', () => {
    const credentials = { email: `life-${Date.now()}@example.com`, password: 'correct-horse-battery' };
    const cookieValue = (res: request.Response, name: string) => {
      const header = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith(`${name}=`));
      return header?.split(';')[0].slice(name.length + 1);
    };

    it('registers once, rejects duplicates and serves /me only with a valid bearer token', async () => {
      const register = await request(app).post('/api/auth/register').send(credentials);
      expect(register.status).toBe(200);
      expect(register.body.user.plan).toBe('free');
      expect((await request(app).post('/api/auth/register').send(credentials)).status).toBe(409);

      const token = register.body.accessToken as string;
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(credentials.email);
      expect((await request(app).get('/api/auth/me')).status).toBe(401);
      expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense')).status).toBe(401);
    });

    it('stores and returns preferences, and rejects unknown fields', async () => {
      const login = await request(app).post('/api/auth/login').send(credentials);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };
      expect((await request(app).put('/api/auth/preferences').set(auth).send({ ui_mode: 'simple' })).status).toBe(200);
      const prefs = await request(app).get('/api/auth/preferences').set(auth);
      expect(prefs.status).toBe(200);
      expect(JSON.stringify(prefs.body)).toContain('simple');
      expect((await request(app).put('/api/auth/preferences').set(auth).send({ plan: 'admin' })).status).toBe(400);
    });

    it('rotates refresh tokens and rejects a replayed one', async () => {
      const login = await request(app).post('/api/auth/login').send(credentials);
      const first = cookieValue(login, 'refreshToken')!;
      expect(first).toBeTruthy();

      const rotated = await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${first}`);
      expect(rotated.status).toBe(200);
      expect(rotated.body.accessToken).toBeTruthy();
      const second = cookieValue(rotated, 'refreshToken')!;
      expect(second).not.toBe(first);

      expect((await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${first}`)).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=garbage')).status).toBe(401);
    });

    it('logs out and revokes every session', async () => {
      const login = await request(app).post('/api/auth/login').send(credentials);
      const refresh = cookieValue(login, 'refreshToken')!;
      expect((await request(app).post('/api/auth/logout').set('Cookie', `refreshToken=${refresh}`)).status).toBe(200);
      expect((await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${refresh}`)).status).toBe(401);

      const again = await request(app).post('/api/auth/login').send(credentials);
      const live = cookieValue(again, 'refreshToken')!;
      const all = await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${again.body.accessToken}`);
      expect(all.status).toBe(200);
      expect((await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${live}`)).status).toBe(401);
    });

    it('locks out repeated wrong passwords', async () => {
      const email = `lock-${Date.now()}@example.com`;
      await request(app).post('/api/auth/register').send({ email, password: 'correct-horse-battery' });
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push((await request(app).post('/api/auth/login').send({ email, password: 'wrong-password-xx' })).status);
      }
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses).toContain(429);
    });
  });

  describe('admin', () => {
    it('requires the admin token', async () => {
      expect((await request(app).get('/api/admin/usage')).status).toBe(401);
      expect((await request(app).get('/api/admin/usage').set('X-Admin-Token', 'wrong-token')).status).toBe(401);
      expect((await request(app).get('/api/admin/metrics')).status).toBe(401);
    });

    it('serves usage and metrics with the token', async () => {
      const headers = { 'X-Admin-Token': process.env.ADMIN_API_TOKEN! };
      expect((await request(app).get('/api/admin/usage').set(headers)).status).toBe(200);
      expect((await request(app).get('/api/admin/metrics').set(headers)).status).toBe(200);
    });
  });

  describe('generated images', () => {
    it('lets only the owner read, explain, upscale and delete a generation', async () => {
      const owner = request.agent(app);
      const other = request.agent(app);
      const { requestId } = await generated(owner);

      expect((await owner.get(`/api/prompts/${requestId}`)).status).toBe(200);
      expect((await other.get(`/api/prompts/${requestId}`)).status).toBe(404);
      expect((await other.delete(`/api/prompts/${requestId}`)).status).toBe(404);

      expect((await owner.get(`/api/jobs/transparency/${requestId}`)).status).toBe(200);
      expect((await other.get(`/api/jobs/transparency/${requestId}`)).status).toBe(403);
      expect((await owner.get('/api/jobs/transparency/missing-id')).status).toBe(404);

      expect((await owner.get('/api/jobs/recent')).body.jobs.length).toBeGreaterThan(0);
      expect((await owner.get('/api/jobs/history')).body.generations.length).toBe(1);
      expect((await other.get('/api/jobs/history')).body.generations.length).toBe(0);

      expect((await other.post('/api/upscale').send({ request_id: requestId })).status).toBe(404);
      expect((await owner.post('/api/upscale').send({})).status).toBe(400);
      const upscaled = await owner.post('/api/upscale').send({ request_id: requestId, scale: 2 });
      expect(upscaled.status).toBe(200);
      expect(upscaled.body.image_url).toMatch(/^\/uploads\/upscaled_/);

      expect((await owner.delete(`/api/prompts/${requestId}`)).status).toBe(200);
      expect((await owner.delete(`/api/prompts/${requestId}`)).status).toBe(404);
      expect((await owner.post('/api/upscale').send({ image_url: '/uploads/not-mine.png' })).status).toBe(404);
    });

    it('cancels an active job once', async () => {
      const agent = request.agent(app);
      const created = await agent.post('/api/jobs/generate').send({ positive_prompt: 'two dogs playing in the snow' });
      expect(created.status).toBe(202);
      const before = await db.get('SELECT status, error_message FROM jobs WHERE id = ?', [created.body.job_id]);
      const first = await agent.post(`/api/jobs/cancel/${created.body.job_id}`);
      expect(first.status, JSON.stringify({ before, body: first.body })).toBe(200);
      expect((await agent.post(`/api/jobs/cancel/${created.body.job_id}`)).status).toBe(400);
      await idle();
    });

    it('purges generations older than the retention window', async () => {
      const agent = request.agent(app);
      const { requestId } = await generated(agent);
      await db.run('UPDATE generations SET created_at = 1 WHERE request_id = ?', [requestId]);
      const purged = await retention.purgeExpired();
      expect(purged.generations).toBeGreaterThanOrEqual(1);
      expect((await agent.get(`/api/prompts/${requestId}`)).status).toBe(404);
    });
  });

  describe('prompt helpers', () => {
    it('enhances allowed prompts and refuses blocked or invalid ones', async () => {
      expect((await request(app).post('/api/enhance-prompt').send({ prompt: 'a red bird' })).status).toBe(200);
      expect((await request(app).post('/api/enhance-prompt').send({ prompt: 'nsfw porn' })).status).toBe(422);
      expect((await request(app).post('/api/enhance-prompt').send({ prompt: '' })).status).toBe(400);
    });

    it('lists styles', async () => {
      expect((await request(app).get('/api/styles')).status).toBe(200);
    });
  });
});
