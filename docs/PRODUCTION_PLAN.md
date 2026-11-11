# Lexigraph: production and guardrails plan

Status: design. Nothing below is built yet unless marked DONE.

## 1. What we are protecting

| Asset | Failure we must prevent |
|---|---|
| The single GPU (RTX 3050, one model, ~0.3 s per 64x64 image) | One user or script starves everyone; runaway queue |
| Users' prompts and images | Reading or deleting another user's data (IDOR), leaking via history |
| The service itself | Crash loops, stuck jobs, DB or ml_service outage taking the API down |
| Content and legal | Harmful or abusive prompts, unmarked synthetic images, unlicensed training data |
| Secrets | Weak defaults, tokens in logs, secrets in the client bundle |

## 2. Defence in depth (request path, outside in)

1. **Edge**: TLS, helmet headers, CORS allowlist, 1 MB JSON body limit (uploads use their own limit), request id on every request.
2. **Validation**: a zod schema per route. Hard bounds: prompt 1-500 chars, steps 1-50, cfg 1-6, seed 0-2^31, scale in {2,4}. Reject, never clamp silently.
3. **Identity**: session cookie for anonymous users, JWT for accounts. Ownership checks on every read and write (DONE for prompts, history, jobs, upscale).
4. **Quotas and rate limits**: per IP, per session, per user, stored in Postgres so they survive restarts and work across instances. Daily generation quota by plan.
5. **Admission control**: at most 1 active job per session, global queue depth cap (for example 20). Over the cap returns 429 or 503 with Retry-After. No unbounded queue.
6. **Prompt policy**: normalise (Unicode NFKC, whitespace), denylist plus pattern rules, result stored in `jobs.safety_flags` (column already exists). Blocked prompts return a clear reason and are counted, not generated.
7. **Model call**: timeout, retry with backoff for transient errors only, circuit breaker around ml_service so a dead GPU process fails fast.
8. **Output**: every PNG carries provenance metadata (tEXt chunk: generator, model step, UTC time, request id). Optional later: a small classifier trained from scratch (project rule: no pretrained weights).
9. **Audit and observability**: structured JSON logs (pino), metrics (queue depth, latency p50/p95, error rate, rejects by reason), audit table for admin actions.

## 3. Reliability

- Replace idempotent DDL in code with real migrations (node-pg-migrate), run in CI and at deploy.
- Stuck-job reaper at boot: any job left `running` becomes `failed`.
- Graceful shutdown on SIGTERM: stop accepting, drain the in-flight job, close the pool.
- Split health: `/health/live` (process) and `/health/ready` (DB reachable, ml_service reachable, model loaded).
- Env validation with zod at startup; refuse to boot in production with missing or default secrets (DONE for JWT).
- Neon: use the pooler URL (DONE), pool max 5, handle scale-to-zero reconnects (DONE: idle error handler).

## 4. Data governance

- Retention: delete images and rows older than N days (config), plus a user-triggered "delete my data" endpoint.
- Ownership today is an IP hash. Migrate to session or user id so shared networks do not share history.
- Licence: the model was trained on Flickr8k, which has no verified licence. Treat the weights as research-only until a licensed dataset is used. This is a product blocker, not a footnote.

## 5. Quality bar

- Server and client both typecheck and build in CI (client currently fails `tsc`: ~19 errors left, mostly unused imports; Vite env types fixed).
- Tests: unit (validation, policy, quota math), integration (routes against a Neon branch), one e2e (generate an image). Target 80%.
- Docker for api, ml_service and client; `docker compose up` brings the stack up.

## 6. UI / UX

- Honest model labels. The UI offers sd15, sd14 and sdxl; the real model is a 64x64 from-scratch model. Show what it is and what size it makes.
- Real progress: stream sampler steps over SSE instead of the simulated progress bar.
- Loading, empty and error states on every screen, error boundary at the root, keyboard and screen-reader pass.
- Emojis removed (DONE). Solid heading instead of gradient text (DONE on Home).

## 7. Phases

| Phase | Scope | Size |
|---|---|---|
| P0 | Client build green, zod validation and bounds, helmet, body limits, env validation, stuck-job reaper, graceful shutdown, health split | M |
| P1 | Postgres rate limits and quotas, admission control, prompt policy with safety_flags, audit log, structured logs and metrics | L |
| P2 | Migrations, tests and CI, Docker, retention and delete-my-data, PNG provenance | L |
| P3 | UI redesign (honest model selector, SSE progress, states, accessibility) | L |
