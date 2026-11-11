# HANDOFF (Lexigraph)

## Goal
Own models only, all weights trained from random init (RTX 3050 6GB, Kaggle later). No pretrained checkpoints, no
third-party generation APIs. Neon DB done. Order of work: docs/OPEN_SOURCE_PLAN.md (phases A, B, C...), ML roadmap in docs/ml/.

## State (2026-11-11)
- T2I model: runs/20261111-003851-t2i-s0/ckpt.pt (16.3M params, 64x64, flow matching). Best at CFG 3 (server caps cfg_scale at 6).
- Neon project fragrant-fire-98602747, db lexigraph. Server compiles; client builds; `npm audit --omit=dev` = 0 (root).
- DONE A3 (LoRA, admin placeholders, Flask prototype routes removed; upscale = own images only, <=512px, counts against quota).
- DONE A0 (P1 guardrails verified live), A1 (C1 plan injection, C2 ml_service token/loopback/no CORS, C3 /api/ml deleted),
  A2 (TRUST_PROXY, hashed cookie-only sessions, generation ownership by session, hashed single-use refresh tokens with
  reuse detection, per-IP quota + active-job cap + session-creation limit, idle-session purge, login/admin limiter).
- Regression suite: `npm run smoke` (server/scripts/smoke-guardrails.ts, needs server + ml_service running, 40 checks,
  seeds DB state, clears rate_limits; dev DB only). Run it after every server change.

## Run
Flask: cd ml_service; ..\Lexigraph_env\Scripts\python.exe app.py (127.0.0.1:5000, needs ML_INTERNAL_TOKEN from .env)
App: npm run dev (server :3000, Vite :5173 proxies /api and /uploads; client uses same-origin URLs so the session cookie flows).
Killing Flask: the reloader leaves a child on :5000; stop the listener on the port, not the parent.

## Behaviour changes to remember
- Sessions: cookie only (sameSite strict); the client no longer sends X-Session-Id (useSession.ts deleted). Client and API
  must share a site (Vite proxy in dev, one domain in prod). Old prompts-table rows (IP-owned) are unreachable by design;
  /api/history, /api/prompts and upscale-by-request_id now read `generations` scoped by session.
- Refresh tokens issued before A2 were deleted (re-login). Quotas now work (sessions.user_id column was missing, so the
  quota query used to fail open). Anonymous: 20/day per session AND 40/day per IP; free 50; pro 500.
- TRUST_PROXY env (default 0). Set 1 behind exactly one proxy. Never `true`.

## Next
1. A4 (M): H6 torch.load weights_only, M1-M4, M6-M10 (retention job for uploads incl. upscaled_*.png, FLASK_DEBUG, env zod,
   one error helper: ~30 `error.message` leaks in routes, maxConcurrent=1, AbortSignal on cancel), /health/live + /ready.
2. Phase B (open-source hygiene) before any push; then C (tests/CI/Docker), D (UI), ML tasks (docs/ml/BUILD_PLAN.md, M0.1 first).
Known accepted: client react-router moderate advisories (breaking v7 upgrade; not reachable in this SPA).
Leftover prototype code in ml_service/ (inference/, utils/cloudwatch.py, advanced/, train*.py, saved_models/) is unused by app.py;
delete after the owner confirms. DB tables lora_models/training_images/ml_* are dormant (drop in a later migration).

## By the user
Rotate the old HF token and the Neon password (it appeared in chat). Regenerate the Kaggle token. ML_INTERNAL_TOKEN was
generated into .env (gitignored).

## Rules
No subagents. No commits unless asked. State task size (S/M/L) first; ask before L.
GateGuard: first edit of a file and first shell command per session are denied once; state importers, data schema and the
verbatim request in text, then retry. Heredocs with quotes can break the Bash tool: use the Write tool for new files.

## A4 done
- H6/H7, M1-M10, L3-L5, health endpoints, shutdown drain complete; smoke 55/55, test:policy 16/16, tsc clean.
- All code comments removed; project rule: no comments (see CLAUDE.md). Env docs: docs/ENVIRONMENT.md, limits: docs/KNOWN_LIMITS.md.
- Open: M4 generic register response (no email verification), policy runs on user prompt only, client react-router moderate advisories.
- User actions: rotate HF token + Neon password, regenerate Kaggle token.
- Next: frontend stack decision (user dislikes React), then Phase B open-source hygiene.

## Phase B status (2026-11-11)
- B1-B5 done and staged: .gitignore, .gitattributes, LICENSE (Apache-2.0), NOTICE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, README, docs (ARCHITECTURE, DEPLOYMENT, TRAINING, MODEL_CARD), issue/PR templates, .editorconfig, CHANGELOG, dependabot.
- Project renamed Aether AI (package names, UI titles). DB file and localStorage keys keep the old lexigraph name.
- GSAP added: client/src/hooks/useReveal.ts, used in RecentGenerations. Frontend stays React + TypeScript.
- Secrets: user chose NOT to rotate the old Neon, Hugging Face and Kaggle keys. They live only in the ignored root .env (ml_service/.env was merged into it). Scan of staged files found no secrets. gitleaks not run (no binary, Docker off).
- GitHub: logged in as Sagexd08. No repo named Etheria/Aether AI exists; Sagexd08/Aether is a different, existing project. Push target undecided.
- Next: Phase C (integration tests, migrations, containers, CI), size L. Ask before starting.
