# Lexigraph security and loophole audit

Date: 2026-11-11. Scope: `server/src`, `ml_service/app.py`, `ml_service/t2i_service.py`, client auth/session code, repo hygiene.

How to read this: each finding has an id, a severity, the evidence (file), how it is abused, the fix, and a check that proves the fix. "Verified" means the flaw was read in the code. "Suspected" means the code suggests it but it was not reproduced; reproduce before fixing. Nothing here was exploited against a running system, and `npm audit` output was not reviewed line by line.

Not reviewed: `routes/styles.ts`, `routes/ml.ts` bodies (only the route list), `services/promptEnhancer.ts`, `services/mlService.ts` callers, most client pages, the training scripts, and the Neon project settings.

## Summary

| Id | Severity | Finding | Status |
|---|---|---|---|
| C1 | Critical | Anyone can register with `plan: "admin"` | Verified |
| C2 | Critical | ml_service is reachable without auth and bypasses every guardrail | Verified |
| C3 | Critical | Unauthenticated model activation and metrics through `/api/ml/*` | Verified (route list) |
| H1 | High | Ownership is an IP hash, and the IP can be spoofed with `X-Forwarded-For` | Verified, exploit depends on deployment |
| H2 | High | Refresh-token revocation is never enforced; tokens stored in plain text | Verified |
| H3 | High | LoRA endpoints have no auth or ownership; 500 MB uploads held in memory | Verified |
| H4 | High | Anonymous limits vanish when the client drops its session cookie | Verified |
| H5 | High | Upscale has no quota, no ownership check, and its outputs are never purged | Verified |
| H6 | High | `torch.load` unpickles checkpoints (code execution from a shared checkpoint) | Verified |
| H7 | High | Old dependencies with known advisories (multer 1.x, `npm audit` warnings) | Suspected, audit not triaged |
| M1 | Medium | Admin token accepted in the query string, compared non-constant-time, kept in localStorage | Verified |
| M2 | Medium | Access token in localStorage; no CSP on the client | Verified |
| M3 | Medium | Raw `error.message` returned to clients; unvalidated `limit`/`offset` | Verified |
| M4 | Medium | Weak login protection: no lockout, email enumeration, no email or password rules | Verified |
| M5 | Medium | Session id stored raw; a session row is created for every cookieless request | Verified; per-request sessions from the client header are suspected |
| M6 | Medium | Generated images are public and permanent | Verified |
| M7 | Medium | Prompt policy is a regex denylist and only checks the positive prompt | Verified |
| M8 | Medium | Rate limiter fails open; fixed window allows a 2x burst | Verified (by design, documented) |
| M9 | Medium | `FLASK_DEBUG=true` exposes the Werkzeug debugger on `0.0.0.0` | Verified |
| M10 | Medium | Insecure defaults when `NODE_ENV` is unset | Verified |
| M11 | Medium | Legal: weights trained on Flickr8k cannot be published under a permissive licence | Verified (HANDOFF) |
| L1-L8 | Low | Product and logic loopholes (see section 4) | Mixed |

## 1. Critical

### C1. Anyone can register as an admin
- Evidence: `server/src/routes/auth.ts`, register handler: `const { email, password, plan = 'free' } = req.body;` then `createUser(email, password, plan)`. `middleware/auth.ts` `requireAdmin` trusts `req.user.plan === 'admin'`. The new daily quota (`services/rateLimiter.ts` `consumeDailyQuota`) skips admins.
- Abuse: `POST /api/auth/register {"email":"a@b.c","password":"12345678","plan":"admin"}` returns an admin JWT. `plan: "pro"` gives a free upgrade.
- Fix: delete `plan` from the register handler; always create `'free'`. Plans change only through an admin action that writes `audit_log`. Add a DB constraint: `CHECK (plan IN ('free','pro','admin'))`.
- Check: test that registering with `plan: "admin"` yields a user row with `plan = 'free'`. Query existing rows: `SELECT id, email, plan FROM users WHERE plan <> 'free'` and review each.

### C2. ml_service is an unauthenticated back door
- Evidence: `ml_service/app.py`: `CORS(app)` (all origins), `app.run(host='0.0.0.0', ...)`, no auth on any route.
- Abuse: anyone who can reach port 5000 calls `/ml/generate-image` directly. No rate limit, no quota, no prompt policy, no admission control. Any website open in a browser on the same network can do the same through CORS. `/ml/models/activate` is also open.
- Fix: bind `127.0.0.1` by default (`ML_HOST` env to override); remove `CORS(app)` (the browser never needs to call it); require a shared secret header `X-Internal-Token` (`ML_INTERNAL_TOKEN` env, constant-time compare with `hmac.compare_digest`) on every route except `/health`; send it from `services/mlClient.ts`. Set `MAX_CONTENT_LENGTH` (for example 8 MB). In Docker, do not publish the ml_service port.
- Check: `curl` without the header returns 401; with it returns 200; the Node app still generates.

### C3. Unauthenticated ML admin routes on the public API
- Evidence: `server/src/routes/ml.ts`: `router.post('/models/activate', async ...)`, `router.get('/metrics', ...)`, `router.get('/models', ...)` have no auth middleware.
- Abuse: any visitor can switch or deactivate model versions.
- Fix: these belong to the old RNN/GAN prototype. Preferred: delete `routes/ml.ts`, `services/mlService.ts` and the matching Flask routes if the client does not use them (grep `api/ml` in `client/src` first). Otherwise put `adminAuth` on activate, metrics and models, and zod-validate the bodies.
- Check: unauthenticated `POST /api/ml/models/activate` returns 401 or 404.

## 2. High

### H1. Ownership by IP hash, with a spoofable IP
- Evidence: `routes/history.ts`, `routes/prompts.ts` scope rows by `ip_hash`. `index.ts` sets `app.set('trust proxy', 1)`. With that setting Express takes the client IP from the last `X-Forwarded-For` entry.
- Abuse: if the server is reachable without exactly one trusted proxy in front, an attacker sends `X-Forwarded-For: <victim ip>` and reads or deletes that person's prompt history, and rotates the header to dodge every per-IP rate limit. Separately, everyone behind one NAT (office, campus, mobile carrier) shares a history, and a user who changes network loses theirs.
- Fix: (1) make `trust proxy` an env setting (`TRUST_PROXY`, default `false`); document the value for each deployment. (2) Move ownership from `ip_hash` to `session_id` (and `user_id` when signed in) for `prompts`, as `generations` and `jobs` already do. Keep `ip_hash` for abuse limiting only.
- Check: with `TRUST_PROXY=false`, a request with a forged `X-Forwarded-For` gets the same rate-limit key as one without. A second session from the same IP cannot read the first session's prompts.

### H2. Refresh tokens: revocation not enforced, stored in plain text
- Evidence: `services/auth.ts` `storeRefreshToken` writes the raw JWT into `refresh_tokens.token_hash`. `routes/auth.ts` refresh handler calls `verifyRefreshToken` (signature only) and never looks the token up, so `revoked_at` is ignored.
- Abuse: a stolen refresh token keeps working after logout and after "logout all devices" until it expires (7 days). A database leak hands out working tokens. A rotated-out token can be replayed.
- Fix: store `sha256(token)`; on refresh require a row with that hash, `revoked_at IS NULL` and `expires_at > now`, else 401. Add a `jti` claim so two tokens issued in the same second differ. On reuse of a revoked token, revoke all of that user's tokens (reuse detection). Do the lookup and the revoke in one transaction.
- Check: tests for logout then refresh (401), logout-all then refresh (401), refresh twice with the same token (second is 401 and all tokens are revoked).

### H3. LoRA endpoints are open to everyone
- Evidence: `routes/lora.ts`: list, create, update, delete and image upload use only `generalApiRateLimiter`. Upload is `multer.memoryStorage()` with `fileSize: 10 MB, files: 50`. File extension comes from `file.originalname`. The response returns `image_path` (absolute server path).
- Abuse: delete or rename any model; upload 500 MB per request into RAM (repeat to crash the process); fill the disk; learn the server's directory layout.
- Fix: the from-scratch model does not use LoRA, so the honest fix is to remove the feature (routes, tables stay for a later migration, client page hidden). If it stays: require auth, add `owner_user_id`, check ownership on every route, switch multer to disk storage with a per-request cap (for example 10 files x 5 MB), verify image magic bytes, force the extension from the detected type, cap images per model, and return ids instead of paths.
- Check: anonymous `DELETE /api/lora/:id` returns 401 or 404; a 50-file upload is rejected.

### H4. Anonymous limits are per session, and a session is free
- Evidence: `middleware/session.ts` creates a new session for any request without a valid cookie. `consumeDailyQuota` keys anonymous users by session id. `jobQueue.createJob` allows one active job per session and 20 globally.
- Abuse: a script that never sends the cookie gets a fresh daily quota on every request and one queue slot per request. Ten requests per minute per IP (the only IP-keyed limit on generation) are enough to hold all 20 queue slots, so nobody else can generate. Each request also inserts two database rows.
- Fix: key the anonymous daily quota by IP hash as well (consume both, reject if either is over). Add a per-IP active-job cap (for example 2) inside the admission transaction (store `ip_hash` on `jobs`, which also fixes L3). Rate-limit session creation per IP (for example 10 new sessions per hour). Purge sessions idle for 30 days.
- Check: 30 cookieless generate requests from one IP produce at most 20 accepted jobs per day and never more than 2 active at once.

### H5. Upscale abuse
- Evidence: `routes/upscale.ts`: no session, no quota, only the 100/min IP limit. `request_id` lookup reads `prompts` without an ownership check. Results are written to `uploads/` forever. ml_service accepts inputs up to 2048x2048, so one call can produce an 8192x8192 PNG.
- Abuse: 100 heavy resizes a minute per IP ties up the CPU and fills the disk with large PNGs. Any upscaled file can be fed back in.
- Fix: add `attachSession`, count upscales against the daily quota, limit input to images this server generated and that the caller owns (look up `generations` by `request_id` and `session_id`; drop the free-form `image_url` branch or restrict it to the caller's own files), cap input at 512x512, and include upscaled files in the retention purge.
- Check: upscaling another session's `request_id` returns 404; the 21st upscale of the day returns 429.

### H6. Checkpoints are loaded with pickle
- Evidence: `ml_service/t2i_service.py` lines 32 and 51: `torch.load(...)` without `weights_only=True`.
- Abuse: once the project is public, people will share checkpoints. A crafted `.pt` file runs arbitrary code when loaded.
- Fix: `torch.load(path, map_location=..., weights_only=True)`. Publish weights as `safetensors` with a SHA-256 in the release notes, and verify the hash at load.
- Check: the service still loads the current checkpoint with `weights_only=True`; a test checkpoint containing a pickled function is rejected.

### H7. Dependencies
- Evidence: `package.json` has `multer ^1.4.5-lts.1` (the 1.x line has published denial-of-service advisories; 2.x is the maintained line), `better-sqlite3` is still listed though the app is on Postgres, and `npm install` printed audit warnings that were not triaged.
- Fix: run `npm audit` in the root and in `client/`, upgrade multer to 2.x, remove `better-sqlite3` and its types from runtime dependencies (the migration script can install it on demand), pin Python requirements with hashes, and turn on Dependabot.
- Check: `npm audit --omit=dev` reports no high or critical issues in CI.

## 3. Medium

- **M1 Admin token.** `middleware/auth.ts` `adminAuth` accepts `req.query.token` (ends up in access logs, proxies and browser history), compares with `!==`, and there is one shared token with no identity, so `audit_log.actor` is always the same. `client/src/pages/AdminPage.tsx` keeps it in localStorage. `routes/admin.ts` `reload-models` and `shutdown-job` return success without doing anything. Fix: header only, `crypto.timingSafeEqual` on equal-length buffers, a strict per-IP limiter on admin routes with failed attempts written to `guard_events`, and real admin accounts (JWT with `plan = 'admin'`) as the long-term path. Make the placeholder routes real or remove them.
- **M2 Token storage.** `client/src/contexts/AuthContext.tsx` stores the access token in localStorage, where any script injection can read it. Fix: keep the access token in memory only and rely on the httpOnly refresh cookie to get a new one on load; add a Content-Security-Policy for the client (`default-src 'self'`; `img-src 'self' <api origin> data:`; no inline scripts).
- **M3 Error leakage and unvalidated queries.** Most route `catch` blocks return `error.message`, which exposes SQL and schema details. `routes/history.ts` passes `parseInt(limit)` straight to SQL: `limit=abc` gives a 500 with a database error, and `limit=1000000` is accepted. Fix: one error helper that logs the error with the request id and returns a generic message plus `request_id`; zod schemas for every query string (`limit` 1 to 50, `offset` 0 to 10000).
- **M4 Account security.** Login and register share the 100/min IP limit. No per-account throttle, no lockout, no email format check, no email verification, password minimum of 8 with no maximum (bcrypt ignores bytes past 72, and very long inputs waste CPU). Register reveals whether an email exists; `createUser` has a check-then-insert race. Fix: zod schema (email format, password 10 to 72 chars), limiter of 5 attempts per 15 minutes keyed by email plus IP, generic register response, unique-violation handling instead of the pre-check.
- **M5 Sessions.** `sessions.id` is the bearer value and is stored raw, so a database leak is a session leak. Every cookieless request inserts rows. Suspected bug: `client/src/hooks/useSession.ts` generates its own UUID and sends it as `X-Session-Id`; the server prefers the header over the cookie, finds no such session, and creates a new one each time. If that is what happens, every header-carrying request gets a new session, and job status checks would fail with 403. Reproduce first. Fix: issue a random token, store only its hash, look up by hash; accept the session from the cookie only; remove the client-generated id.
- **M6 Public, permanent images.** `/uploads` is served statically with no auth. Names are UUIDs (not guessable), but any leaked link works forever and nothing is deleted. Fix: retention job (config, default 30 days), a "delete my data" endpoint, and optionally serve images through an ownership-checked route.
- **M7 Prompt policy limits.** `services/promptPolicy.ts` is a short English regex list. It is bypassed by paraphrase, other languages, and Cyrillic or Greek look-alikes (NFKC does not fold those). It checks only `positive_prompt`, not the enhancer's output. It can also block harmless prompts (for example "teenage skateboarder, explicit detail"). Nothing checks the output image. Fix: add a confusables fold for the common look-alike letters, run the policy on the final prompt after enhancement, keep a test file of must-block and must-pass prompts, and document plainly that this is a first filter, not a safety guarantee.
- **M8 Limiter behaviour.** `pgRateLimit` lets requests through when the database errors, and fixed windows allow twice the limit across a window edge. Both are deliberate and logged. Fix if needed: fail closed on the generate route only.
- **M9 Flask debug.** `FLASK_DEBUG=true` enables the Werkzeug debugger, which is remote code execution when the service listens on `0.0.0.0`. Fix: remove the flag, and run under waitress or gunicorn in every mode.
- **M10 Defaults.** With `NODE_ENV` unset, cookies are not `secure`, JWT secrets are random per process, and the IP salt can be the built-in default. Fix: validate the whole environment with zod at startup and refuse the default salt in every mode.
- **M11 Licence of the weights.** The 100k-step checkpoint was trained on Flickr8k, which is distributed for research use. Publishing those weights, or running a public demo on them, is a legal risk. Fix: see the open-source plan, phase E.

## 4. Low: product and logic loopholes

- **L1** The UI offers `sd15`, `sd14` and `sdxl`, and `width`/`height` up to 768, but there is one 64x64 model and the server ignores those fields. Users are told something untrue.
- **L2** Progress is simulated with random increments, not sampler steps.
- **L3** `generations.ip_hash` is always the string `'unknown'`.
- **L4** Cancel does not stop the GPU work: the abort flag is only read after the image comes back, and `imageGen` does not pass an abort signal to axios.
- **L5** `maxConcurrent = 3` on one GPU. Three jobs run at once against a model that serves one at a time.
- **L6** In-memory state (running jobs, circuit breaker, latency ring) is per process. A second API instance would reap the first one's running jobs after 10 minutes and keep its own breaker.
- **L7** `guard_events`, `audit_log`, `usage`, `sessions` and `rate_limits` grow without bound (only `rate_limits` is purged).
- **L8** Dead surface: RNN/GAN routes and tables, `backend/` (empty), `Lexigraph_env/` (a virtualenv inside the project and not in `.gitignore`).

## 5. Repository and secrets

- The project is not a git repository yet. Before the first commit: add `Lexigraph_env/`, `training/`, `.claude/`, `.qodo/`, `.impeccable/`, `.vscode/`, `HANDOFF.md`, `data/` and `*.pt` to `.gitignore`, then run a secret scanner (gitleaks) over the working tree.
- Secrets that appeared in chat must be rotated before any public release: the Neon database password, the old Hugging Face token, the Kaggle token. Also regenerate `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_API_TOKEN` and `IP_HASH_SALT` (changing the salt orphans IP-keyed history, which H1 removes anyway).
- `.env` and `.env.example` start with a UTF-8 byte-order mark. Save them without it; some tools read the first key as `﻿ADMIN_API_TOKEN`.
- `.env.example` lacks `JWT_REFRESH_SECRET`.

## 6. Fix order

1. C1, C2, C3 (one short session, all small).
2. H2, H4, H1 (identity and limits).
3. H3, H5, H6, H7.
4. M1 to M10, then the low items alongside the UI work.

Each fix lands with its check as an automated test (see `docs/OPEN_SOURCE_PLAN.md`, phase C).
