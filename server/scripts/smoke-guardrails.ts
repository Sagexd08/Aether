import { db, closeDb } from '../src/database/db.js';
import { hashString } from '../src/utils/crypto.js';
import { config } from '../src/config/env.js';
import { purgeExpired } from '../src/services/retention.js';
import { randomUUID } from 'crypto';
import { existsSync, writeFileSync, utimesSync } from 'fs';
import path from 'path';

const BASE = process.argv[2] ?? 'http://localhost:3000';
if (process.env.NODE_ENV === 'production') throw new Error('refusing to run in production');

class Client {
  cookies = new Map<string, string>();

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === '' || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
    }
    return { status: res.status, json, headers: res.headers };
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const dayWindow = () => nowSec() - (nowSec() % 86_400);
const prompt = (text: string) => ({ positive_prompt: text });
const PASSWORD = 'correct horse battery';

async function sessionRow(c: Client) {
  return db.get<{ id: string; ip_hash: string }>('SELECT id, ip_hash FROM sessions WHERE session_hash = ?', [
    hashString(c.cookies.get('sessionId') ?? ''),
  ]);
}

async function seedActiveJobs(sessionId: string, ipHash: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    await db.run(
      "INSERT INTO jobs (id, session_id, ip_hash, type, params, status) VALUES (?, ?, ?, 'generate', '{}', 'running')",
      [`smoke-${sessionId.slice(0, 8)}-${i}`, sessionId, ipHash]
    );
  }
}

const clearSeeded = () => db.run("DELETE FROM jobs WHERE id LIKE 'smoke-%'");
const resetLimits = () => db.run('DELETE FROM rate_limits');

async function sessionsAndOwnership() {
  const a = new Client();
  const first = await a.call('POST', '/api/jobs/generate', prompt('a red bird'));
  check('generate returns 202', first.status === 202, JSON.stringify(first.json));
  const rowA = await sessionRow(a);
  const token = a.cookies.get('sessionId') ?? '';
  check('session cookie is a random 64-hex token', /^[0-9a-f]{64}$/.test(token));
  check('database stores only the hash, not the token', !!rowA && rowA.id !== token);

  const spoof = await a.call('GET', `/api/jobs/status/${first.json.job_id}`, undefined, { 'X-Session-Id': 'attacker-chosen-id' });
  check('client-supplied X-Session-Id is ignored (cookie wins)', spoof.status === 200, `status ${spoof.status}`);

  const b = new Client();
  const foreign = await b.call('GET', `/api/jobs/status/${first.json.job_id}`);
  check('another session cannot read a job (403)', foreign.status === 403, `status ${foreign.status}`);

  await new Promise((r) => setTimeout(r, 4000));
  const gen = await db.get<{ request_id: string }>('SELECT request_id FROM generations WHERE session_id = ?', [rowA!.id]);
  if (!gen) {
    check('generation row exists after the job finished (is ml_service running?)', false, 'none found');
    return { a, rowA: rowA! };
  }
  const own = await a.call('GET', `/api/prompts/${gen.request_id}`);
  const other = await b.call('GET', `/api/prompts/${gen.request_id}`);
  const del = await b.call('DELETE', `/api/prompts/${gen.request_id}`);
  const hist = await b.call('GET', '/api/history');
  check('owner can read own generation', own.status === 200, `status ${own.status}`);
  const jobsHist = await a.call('GET', '/api/jobs/history?limit=1');
  for (const [label, url] of [['prompts', own.json.image_url], ['jobs/history', jobsHist.json.generations?.[0]?.image_url]]) {
    const img = typeof url === 'string' && /^\/uploads\/[\w-]+\.png$/.test(url) ? await fetch(BASE + url) : null;
    check(`${label} image_url is /uploads/<file>.png and serves an image`, !!img && img.status === 200, `url ${url}`);
  }
  check('another session gets 404 reading it', other.status === 404, `status ${other.status}`);
  check('another session cannot delete it (404)', del.status === 404, `status ${del.status}`);
  check('history lists only the caller rows', hist.status === 200 && hist.json.results.length === 0, JSON.stringify(hist.json).slice(0, 120));
  await upscaleChecks(a, b, rowA!.id, gen.request_id, own.json.image_url);
  await deleteMyDataChecks(a, b, gen.request_id);
  return { a, rowA: rowA! };
}

async function upscaleChecks(a: Client, b: Client, sessionId: string, requestId: string, imageUrl: string) {
  await resetLimits();
  const byId = await a.call('POST', '/api/upscale', { request_id: requestId, scale: 2 });
  check('owner upscales own image by request_id -> 200', byId.status === 200 && /^\/uploads\/upscaled_/.test(byId.json.image_url ?? ''), `status ${byId.status}`);
  const byUrl = await a.call('POST', '/api/upscale', { image_url: imageUrl, scale: 4 });
  check('owner upscales own image by url -> 200', byUrl.status === 200, `status ${byUrl.status}`);
  check("another session cannot upscale it by request_id (404)", (await b.call('POST', '/api/upscale', { request_id: requestId })).status === 404);
  check("another session cannot upscale it by url (404)", (await b.call('POST', '/api/upscale', { image_url: imageUrl })).status === 404);
  const free = await a.call('POST', '/api/upscale', { image_url: '/uploads/../.env' });
  check('free-form image_url is rejected (404)', free.status === 404, `status ${free.status}`);
  await db.run('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 20) ON CONFLICT (key, window_start) DO UPDATE SET count = 20', [`quota:${sessionId}`, dayWindow()]);
  const over = await a.call('POST', '/api/upscale', { request_id: requestId });
  check('upscale counts against the daily quota -> 429', over.status === 429, `status ${over.status}`);
}

async function deleteMyDataChecks(a: Client, b: Client, requestId: string) {
  await resetLimits();
  const others = await b.call('DELETE', '/api/data/mine');
  check('delete-my-data by another session leaves this session data alone', others.status === 200 && others.json.deleted.generations === 0, JSON.stringify(others.json));
  const del = await a.call('DELETE', '/api/data/mine');
  check('delete-my-data removes own generations', del.status === 200 && del.json.deleted.generations >= 1, JSON.stringify(del.json));
  check('deleted generation is gone (404)', (await a.call('GET', `/api/prompts/${requestId}`)).status === 404);
}

async function retentionAndHealth() {
  const stale = path.join(config.uploadDir, `${randomUUID()}.png`);
  writeFileSync(stale, 'x');
  const old = new Date(Date.now() - (config.uploadRetentionDays + 10) * 86_400_000);
  utimesSync(stale, old, old);
  await purgeExpired();
  check('retention purge deletes uploads older than the limit', !existsSync(stale));
  const probe = new Client();
  check('/api/health/live -> 200', (await probe.call('GET', '/api/health/live')).status === 200);
  const ready = await probe.call('GET', '/api/health/ready');
  check('/api/health/ready -> 200 with database and model up', ready.status === 200 && ready.json.checks?.database && ready.json.checks?.model, JSON.stringify(ready.json));
}

async function admissionAndQuotas(a: Client, rowA: { id: string; ip_hash: string }) {
  await resetLimits();
  await seedActiveJobs(rowA.id, rowA.ip_hash, 1);
  const busy = await a.call('POST', '/api/jobs/generate', prompt('a blue bird'));
  check('active job -> 429 session_busy with Retry-After', busy.status === 429 && !!busy.headers.get('retry-after'), `status ${busy.status}`);
  await clearSeeded();

  const c = new Client();
  await c.call('GET', '/api/jobs/recent');
  const rowC = await sessionRow(c);
  await seedActiveJobs(rowA.id, rowC!.ip_hash, 2);
  const ipBusy = await c.call('POST', '/api/jobs/generate', prompt('a green bird'));
  check('two active jobs from one IP -> 429 for another session', ipBusy.status === 429, `status ${ipBusy.status} ${JSON.stringify(ipBusy.json)}`);
  await clearSeeded();

  await resetLimits();
  await db.run('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 20)', [`quota:${rowC!.id}`, dayWindow()]);
  const sessQuota = await c.call('POST', '/api/jobs/generate', prompt('a yellow bird'));
  check('21st anonymous generation of the day -> 429', sessQuota.status === 429, `status ${sessQuota.status}`);

  await resetLimits();
  await db.run('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 40)', [`quota_ip:${rowC!.ip_hash}`, dayWindow()]);
  const ipQuota = await new Client().call('POST', '/api/jobs/generate', prompt('a white bird'));
  check('fresh cookie does not reset the per-IP daily quota -> 429', ipQuota.status === 429, `status ${ipQuota.status}`);

  await resetLimits();
  const codes: number[] = [];
  for (let i = 0; i < 12; i += 1) codes.push((await new Client().call('GET', '/api/jobs/recent')).status);
  check('11th cookieless session in an hour -> 429', codes.slice(0, 10).every((s) => s === 200) && codes[10] === 429, codes.join(','));
}

async function validationAndProxy() {
  await resetLimits();
  const e = new Client();
  check('cfg_scale 9 -> 400', (await e.call('POST', '/api/jobs/generate', { ...prompt('a bird'), cfg_scale: 9 })).status === 400);
  check('history limit=abc -> 400', (await e.call('GET', '/api/jobs/history?limit=abc')).status === 400);
  check('history limit=1000000 -> 400', (await e.call('GET', '/api/jobs/history?limit=1000000')).status === 400);
  check('history offset=-5 -> 400', (await e.call('GET', '/api/history?offset=-5')).status === 400);
  const bad = await e.call('GET', '/api/prompts/not%20an%20id');
  check('malformed id answers 400 without database details', bad.status === 400 && !/sql|syntax|relation/i.test(JSON.stringify(bad.json)), JSON.stringify(bad.json));
  check('denylisted prompt -> 422', (await e.call('POST', '/api/jobs/generate', prompt('nsfw porn'))).status === 422);

  await resetLimits();
  const statuses: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await e.call('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'x' }, { 'X-Forwarded-For': `10.0.0.${i + 1}` });
    statuses.push(r.status);
  }
  check('rotating X-Forwarded-For does not dodge the 5-attempt login limit', statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429, statuses.join(','));
  return e;
}

async function accounts() {
  await resetLimits();
  const email = `smoke-${Date.now()}@example.com`;
  const u = new Client();
  check('short password -> 400', (await new Client().call('POST', '/api/auth/register', { email, password: 'short' })).status === 400);
  check('invalid email -> 400', (await new Client().call('POST', '/api/auth/register', { email: 'not-an-email', password: PASSWORD })).status === 400);
  check('password over 72 bytes -> 400', (await new Client().call('POST', '/api/auth/register', { email, password: 'x'.repeat(80) })).status === 400);
  await resetLimits();
  const reg = await u.call('POST', '/api/auth/register', { email: email.toUpperCase(), password: PASSWORD, plan: 'admin' });
  check('register with plan=admin yields a free account', reg.status === 200 && reg.json.user?.plan === 'free', JSON.stringify(reg.json).slice(0, 120));
  check('registering the same email twice -> 409', (await new Client().call('POST', '/api/auth/register', { email, password: PASSWORD })).status === 409);
  const old = u.cookies.get('refreshToken') ?? '';
  const stored = await db.get<{ token_hash: string }>('SELECT token_hash FROM refresh_tokens ORDER BY created_at DESC LIMIT 1');
  check('refresh token is stored hashed (64 hex), not raw', !!stored && /^[0-9a-f]{64}$/.test(stored.token_hash) && stored.token_hash !== old);
  const row = await sessionRow(u);
  const link = await db.get<{ user_id: string | null }>('SELECT user_id FROM sessions WHERE id = ?', [row!.id]);
  check('signing in links the session to the account', !!link?.user_id);

  const r1 = await u.call('POST', '/api/auth/refresh');
  const fresh = u.cookies.get('refreshToken') ?? '';
  check('refresh with a valid token -> 200 and a rotated token', r1.status === 200 && fresh !== '' && fresh !== old, `status ${r1.status}`);
  const replay = new Client();
  replay.cookies.set('refreshToken', old);
  check('replaying the old token -> 401', (await replay.call('POST', '/api/auth/refresh')).status === 401);
  check('reuse revokes the whole family (current token now 401)', (await u.call('POST', '/api/auth/refresh')).status === 401);

  const login = await u.call('POST', '/api/auth/login', { email, password: PASSWORD });
  check('login after revocation works', login.status === 200, `status ${login.status}`);
  const keep = u.cookies.get('refreshToken') ?? '';
  await u.call('POST', '/api/auth/logout');
  const afterLogout = new Client();
  afterLogout.cookies.set('refreshToken', keep);
  check('logout then refresh -> 401', (await afterLogout.call('POST', '/api/auth/refresh')).status === 401);

  const all = new Client();
  await all.call('POST', '/api/auth/login', { email, password: PASSWORD });
  const t1 = all.cookies.get('refreshToken') ?? '';
  const access = (await all.call('POST', '/api/auth/login', { email, password: PASSWORD })).json.accessToken;
  await all.call('POST', '/api/auth/logout-all', undefined, { Authorization: `Bearer ${access}` });
  const afterAll = new Client();
  afterAll.cookies.set('refreshToken', t1);
  check('logout-all then refresh -> 401', (await afterAll.call('POST', '/api/auth/refresh')).status === 401);
}

async function adminSurface(e: Client) {
  await resetLimits();
  check('POST /api/ml/models/activate is gone (404)', (await e.call('POST', '/api/ml/models/activate', {})).status === 404);
  check('/api/lora is gone (404)', (await e.call('GET', '/api/lora')).status === 404);
  check('admin route without token -> 401', (await e.call('GET', '/api/admin/metrics')).status === 401);
  await new Promise((r) => setTimeout(r, 300));
  const failed = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM guard_events WHERE reason = 'admin_auth_failed'");
  check('failed admin attempts are counted in guard_events', Number(failed?.n ?? 0) > 0);
  const token = process.env.ADMIN_API_TOKEN ?? '';
  if (token) {
    check('admin token in the query string is not accepted', (await e.call('GET', `/api/admin/metrics?token=${token}`)).status === 401);
    check('admin token in the header is accepted', (await e.call('GET', '/api/admin/metrics', undefined, { 'x-admin-token': token })).status === 200);
    check('admin placeholder reload-models is gone (404)', (await e.call('POST', '/api/admin/reload-models', {}, { 'x-admin-token': token })).status === 404);
  } else {
    console.log('SKIP  admin token checks (ADMIN_API_TOKEN not in env)');
  }
}

async function cleanup() {
  const mine = "SELECT id FROM users WHERE email LIKE 'smoke-%@example.com'";
  await db.run(`DELETE FROM refresh_tokens WHERE user_id IN (${mine})`);
  await db.run(`UPDATE sessions SET user_id = NULL WHERE user_id IN (${mine})`);
  await db.run(`DELETE FROM user_preferences WHERE user_id IN (${mine})`);
  await db.run("DELETE FROM users WHERE email LIKE 'smoke-%@example.com'");
  await clearSeeded();
  await resetLimits();
}

async function main() {
  await resetLimits();
  await clearSeeded();
  const { a, rowA } = await sessionsAndOwnership();
  await admissionAndQuotas(a, rowA);
  const e = await validationAndProxy();
  await accounts();
  await adminSurface(e);
  await retentionAndHealth();
  await cleanup();
}

main()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    await closeDb();
    console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
  });
