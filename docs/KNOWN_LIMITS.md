# Known limits

Notes that used to live as code comments.

- Metrics are per instance only. Export to Prometheus or OpenTelemetry before running more than one API instance (services/metrics.ts).
- The circuit breaker state is per process. Share it through Postgres if several API instances run (services/mlClient.ts).
- Rate limit counters use fixed windows, which allow a 2x burst at a window edge. Use a sliding log if that matters (services/rateLimiter.ts).
- Job admission takes one global Postgres advisory lock. That is fine for a single GPU. Shard it by session if admissions ever contend (services/jobQueue.ts).
- The prompt policy is a regex denylist and is easy to evade by paraphrase. It is a first filter, not a safety guarantee. A from-scratch classifier is the upgrade path (services/promptPolicy.ts).
- Prompt enhancement is not wired into job creation (routes/jobs.ts) or job execution (services/jobQueue.ts). The policy therefore runs on the user prompt only.
- Anonymous visitors on one shared network share one IP quota (40 per day) and at most 2 active jobs.
- Upscaled outputs are not tracked per session, so delete-my-data cannot remove them. The retention purge removes them by age.
