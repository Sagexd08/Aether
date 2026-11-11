# Architecture

## Request path

1. The browser calls the API on the same origin (Vite proxies `/api` and `/uploads` in development). The session cookie is httpOnly and SameSite=Strict.
2. `POST /api/jobs` passes these steps in order, from `server/src/routes/jobs.ts`:
   1. Rate limits (Postgres fixed-window counters, fail closed).
   2. Session attach, zod validation.
   3. Prompt policy (NFKC normalisation, confusable folding, regex denylist).
   4. Circuit breaker check for `ml_service`.
   5. Daily quota: anonymous 20 per session and 40 per IP, free 50, pro 500, admin unlimited.
   6. Admission under an advisory lock: queue cap 20, one active job per session, two per IP.
3. The API answers 202 with a job id. The client polls the job.
4. A worker claims jobs with `SKIP LOCKED` (one at a time), calls `ml_service` with `X-Internal-Token` (60 s timeout, 2 retries, breaker after 5 failures), saves the PNG under `uploads/` and writes a `generations` row.
5. Images and history older than `UPLOAD_RETENTION_DAYS` are purged hourly. `DELETE /api/data/mine` removes a user's data on request.

## Routes

`/api/jobs`, `/api/history`, `/api/upscale`, `/api/prompts`, `/api/styles`, `/api/enhance-prompt`, `/api/auth`, `/api/data`, `/api/admin`, `/api/health` (`/live`, `/ready`).

## Storage

Neon Postgres. Main tables: `sessions`, `users`, `refresh_tokens`, `jobs`, `generations`, `rate_limits`, `guard_events`, `audit_log`. Definitions live in `server/migrations/*.sql`, applied in order at startup by `server/src/database/migrate.ts`.

## Model

16.3M parameter UNet, 64x64, flow matching, EMA weights, Euler sampler, classifier-free guidance (API cap 6).
