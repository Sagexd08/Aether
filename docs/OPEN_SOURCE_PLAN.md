# Lexigraph open-source plan

Date: 2026-11-11. Written for the engineer or coding agent who will build this, one task per session. Companion: `docs/SECURITY_AUDIT.md` (finding ids such as C1 and H4 refer to it) and `docs/PRODUCTION_PLAN.md` (the earlier guardrails design).

## 1. What this project is, and why someone would star it

Lexigraph is a complete text-to-image product where every weight was trained from random initialisation on a 6 GB consumer GPU: a 16.3M-parameter flow-matching model, the training code, an inference service, a job queue with real guardrails, and a web app. No pretrained checkpoints and no third-party generation APIs.

That is the pitch. It is not a Stable Diffusion competitor and must never look like one. The best version of this project is the clearest, most honest, most reproducible "build your own image model end to end" repository:

1. A stranger can clone it and see an image generated in under 10 minutes (`docker compose up`).
2. A stranger can retrain the model from the documented dataset with one command and get comparable samples.
3. Everything the UI says is true (model size, resolution, what the sliders do).
4. The security and abuse controls are real, tested and documented.
5. The weights and the data they came from are legally publishable.

Every task below serves one of those five.

## 2. Decisions the owner must make first

These block specific phases. Defaults are given so work can start.

| # | Decision | Default if no answer | Blocks |
|---|---|---|---|
| D1 | Code licence | Apache-2.0 (patent grant; `package.json` currently says MIT, change it to match) | Phase B |
| D2 | Weights: retrain on a publishable dataset, or ship code only | Ship code only at first; publish weights after a retrain (phase E) | Phase E |
| D3 | Keep LoRA, admin panel and accounts, or cut to the core loop | Cut LoRA (the model cannot use it); keep accounts and admin | Phases A, D |
| D4 | Public hosted demo, or self-host only | Self-host only until phase E is done | Phase E |
| D5 | Project name and GitHub owner | `lexigraph` under the owner's account | Phase B |

The Flickr8k-trained checkpoint must not be published or served publicly (audit M11).

## 3. Target repository structure

Keep the three existing apps where they are. Do not introduce workspaces or move source trees; the only moves are listed.

```
lexigraph/
  client/                 React + Vite + Tailwind web app (unchanged location)
  server/                 Express API, job queue, guardrails
    src/
    migrations/           node-pg-migrate files (new, replaces DDL in schema.ts)
    tests/                vitest + supertest (new)
    package.json          new: server gets its own package.json (moved out of the root)
  ml_service/             Flask inference service
    requirements.txt      new, pinned
    tests/                pytest (new)
  training/               model, sampler, train scripts (already here: models/t2i.py, models/flow.py,
                          train_t2i.py). Target layout and tasks: docs/ml/BUILD_PLAN.md.
                          Note: TRAINING_DIR defaults to ./training, so LoRA uploads land inside the
                          code package; point it at var/lora/ (or remove LoRA, task A3)
  docs/
    ARCHITECTURE.md       one diagram, request path, data model
    TRAINING.md           dataset, command, expected loss curve, sample grid
    DEPLOYMENT.md         compose, env table, proxy and TRUST_PROXY
    SECURITY_AUDIT.md     exists
    MODEL_CARD.md         data, licence, limits, known biases
  docker/                 Dockerfile.server, Dockerfile.ml, Dockerfile.client, nginx.conf
  compose.yaml            postgres + server + ml_service + client
  .github/
    workflows/ci.yml      typecheck, lint, tests, build, audit
    ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md, dependabot.yml
  var/                    runtime data, gitignored: uploads/, lora/, runs/, models/
  LICENSE  NOTICE  README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  CHANGELOG.md
  .env.example  .gitignore  .editorconfig
```

Delete: `backend/` (empty), `Lexigraph_env/` from the tree (recreate outside or ignore it), `server/scripts/migrate-sqlite-to-neon.ts` after confirming no one needs it, the RNN/GAN prototype routes if unused (audit C3).

## 4. Rules for every task

- One task per session. State the size, do the task, run the task's check, stop.
- A task is done only when its check passes and the output is pasted into the hand-off note. Never write "passes" without the command output.
- Do not commit unless the owner says so. Do not add dependencies beyond the ones named here.
- Verification commands (use these exact ones):
  - Server types: `npx tsc -p server/tsconfig.json --noEmit`
  - Client build: `cd client && npm run build`
  - Server tests (after C1 exists): `npm test`
- Windows host, Git Bash available. Postgres is Neon in dev today; tests use a local Postgres from compose once C3 exists.

## 5. Phase A: make it correct and safe (do first)

### A0. Finish the interrupted P1 work (size S)
The tree does not compile right now. State left behind:

| File | State | Remaining |
|---|---|---|
| `server/src/routes/ml.ts` line 2 | Imports `generateRateLimiter`, which no longer exists. **Server fails to start.** | Import `generateIpLimiter` instead and use it on the two routes (or delete the file under A3) |
| `server/src/routes/lora.ts` | Schemas imported, `:id` params validated | `POST /` still has the manual `name` check: replace with `validateBody(loraCreateSchema)`; in `PUT /:id` the manual "no fields" check is now redundant |
| `server/src/routes/prompts.ts` | Import added, `DELETE` validated | Add `validateParams(idParamSchema)` to `GET /:id` |
| `server/src/routes/admin.ts` | Untouched | Call `audit(req, action, target)` in every handler; add `GET /metrics` returning `snapshot()` from `services/metrics.ts` plus `breakerStatus()` |
| `server/src/middleware/auth.ts` | Untouched | `adminAuth`: header only, `timingSafeEqual` (audit M1) |
| `server/src/routes/health.ts` | Untouched | Leave for C4 |
| `server/src/index.ts` | pino-http wired, dead generate router removed | Replace remaining `console.*` with `logger` |
| `server/src/services/jobQueue.ts`, `imageGen.ts` | Admission, metrics and breaker wired | Replace remaining `console.error` with `logger` |

New files already written and not yet exercised: `utils/logger.ts`, `services/rateLimiter.ts`, `services/metrics.ts`, `services/audit.ts`, `services/promptPolicy.ts`, `services/mlClient.ts`, `middleware/rateLimit.ts` (rewritten), three tables in `database/schema.ts`.

Check: `npx tsc -p server/tsconfig.json --noEmit` prints nothing. Start the server and ml_service, then:
1. `POST /api/jobs/generate {"positive_prompt":"a red bird"}` returns 202 with a `job_id`, and the job completes.
2. A second POST while the first is active returns 429 with `Retry-After`.
3. A prompt matching the denylist returns 422, and `SELECT reason, count(*) FROM guard_events GROUP BY 1` shows it.
4. `cfg_scale: 9` returns 400.
5. Stop ml_service, submit jobs until the breaker opens: the next POST returns 503 quickly.
6. The client still works: it must accept 202 (it may expect 200) and the new default `cfg_scale` of 3. Fix the client if not.

### A1. Close the critical findings (size S)
C1, C2, C3 from the audit, exactly as written there. Files: `server/src/routes/auth.ts`, `server/src/services/auth.ts`, `ml_service/app.py`, `server/src/services/mlClient.ts`, `server/src/config/env.ts` (add `ML_INTERNAL_TOKEN`, required in production), `.env.example`, `server/src/routes/ml.ts`.
Check: the three checks listed under C1, C2, C3.

### A2. Identity and limits (size M)
H1, H2, H4, M5. Order: (1) `TRUST_PROXY` env; (2) session token hashed, cookie only, remove the client-generated id in `client/src/hooks/useSession.ts` after reproducing the suspected per-request-session bug; (3) `prompts` ownership by `session_id` (add the column, backfill is impossible for old rows, so old rows become unreachable: say so in the changelog); (4) refresh-token hashing, lookup and reuse detection; (5) IP-keyed anonymous quota, per-IP active-job cap, `jobs.ip_hash`.
Check: the checks under H1, H2, H4 as automated tests once C1 exists; until then a script in `server/scripts/smoke-guardrails.ts`.

### A3. Remove or lock the dead surface (size M)
H3 (LoRA: remove per D3), H5 (upscale), C3 leftovers (delete the RNN/GAN prototype: `routes/ml.ts`, `services/mlService.ts`, Flask routes `/ml/refine-prompt`, `/ml/generate-control`, `/ml/models*`, `/ml/metrics`, and the `ml_*` tables in a later migration), `routes/admin.ts` placeholders, `better-sqlite3`. Grep `client/src` for each endpoint before deleting and remove the client callers in the same task.
Check: typecheck and client build pass; `grep -rn "api/ml\|api/lora" client/src` returns nothing (if LoRA is cut).

### A4. Remaining audit items (size M)
H6, H7, M1 to M4, M6 to M10, L3 to L5. One error helper (`server/src/utils/httpError.ts`) used by every route `catch`. `maxConcurrent = 1`. Pass an `AbortSignal` from the job to axios so cancel works.
Check: `grep -rn "error.message" server/src/routes` returns nothing; `npm audit --omit=dev` has no high or critical.

## 6. Phase B: open-source hygiene (size M, no code behaviour changes)

Do these in order. B1 must finish before anything is pushed anywhere.

- **B1. Secrets and first commit.** Owner rotates the Neon password and the Hugging Face and Kaggle tokens, and regenerates the JWT secrets, admin token and salt. Fix `.gitignore` (audit section 5). Remove the byte-order mark from `.env` and `.env.example`. Run `gitleaks detect --no-git -v` over the tree and fix every hit. Then `git init`, first commit. Check: gitleaks reports no leaks; `git status --ignored` shows `.env`, the virtualenv, checkpoints and uploads as ignored.
- **B2. Licence and legal files.** `LICENSE` (per D1), `NOTICE`, licence field in both `package.json` files, a header comment is not required. `SECURITY.md` (how to report privately, supported versions, link to the audit), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `CONTRIBUTING.md` (setup, the three verification commands, commit style, how to add a migration, "no pretrained weights" project rule).
- **B3. README.** Order: one-sentence description; a sample grid image with the honest caption "64x64, 16.3M parameters, trained from scratch on one RTX 3050"; quick start (compose); what is in the box (diagram); train your own; limits and non-goals; security; licence. No badges that are not backed by CI. No claims that are not reproducible.
- **B4. Docs.** `docs/ARCHITECTURE.md` (request path: browser, API, guardrail order from `routes/jobs.ts`, queue, ml_service, storage; table list), `docs/DEPLOYMENT.md` (env table generated from `config/env.ts`, proxy setup), `docs/TRAINING.md`, `docs/MODEL_CARD.md` (training data, licence status, limits: 64x64, soft faces, English captions only, bias inherited from the data).
- **B5. Community files.** Issue templates (bug, feature, security redirect), PR template with the verification checklist, `dependabot.yml` (npm root, npm client, pip, actions), `.editorconfig`, `CHANGELOG.md` (Keep a Changelog), version `0.1.0`.

## 7. Phase C: tests, CI, containers (was P2)

- **C1. Test harness (M).** Give `server/` its own `package.json`; add `vitest` and `supertest`. Export the Express `app` from `server/src/app.ts` (no `listen`), keep `index.ts` as the starter. Unit tests first, no database needed: `promptPolicy` (must-block and must-pass lists, NFKC, zero-width, spaced letters), `validate.ts` schemas (bounds on every field), `mlClient` breaker (opens after 5 failures, half-open probe, 4xx does not count), `toPostgres`. Check: `npm test` passes; coverage report printed.
- **C2. Integration tests (M).** Against a real Postgres (compose service or a Neon branch via `TEST_DATABASE_URL`), ml_service replaced by a stub HTTP server. Cover: every audit check (C1 to H5), rate-limit window math, quota refund on admission reject, admission caps under 10 concurrent requests, ownership on every read route. Target 80% on `server/src/services` and `middleware`.
- **C3. Migrations (M).** `node-pg-migrate`; first migration is the current schema verbatim; `schema.ts` shrinks to "run pending migrations". Second migration: constraints (`users.plan` check, status checks) and the columns added in A2. Check: empty database, run migrations, server boots, tests pass.
- **C4. Containers and health (M).** Dockerfiles (multi-stage, non-root user, no secrets baked in), `compose.yaml` (postgres, server, ml_service on an internal network with no published port, client behind nginx). `/health/live` (process up) and `/health/ready` (database reachable, ml_service reachable, model loaded, breaker closed). Graceful shutdown drains the in-flight job. Check: `docker compose up` on a clean machine reaches a generated image using CPU inference.
- **C5. CI (S).** `.github/workflows/ci.yml`: Node 20, install, server typecheck, client build, server tests with a postgres service container, `npm audit --omit=dev --audit-level=high`, pytest for ml_service on CPU, gitleaks. Required on pull requests.
- **C6. Data lifecycle (M).** Retention job (uploads, jobs, generations, sessions, guard_events older than N days), `DELETE /api/me/data`, PNG `tEXt` provenance chunk (generator name, model step, UTC time, request id).

## 8. Phase D: UI

The current client was not visually reviewed for this plan (only its file list and auth code were read), so D1 is an audit before any redesign.

### Reference and design direction

The owner's reference is `p0rz-MVrZo1x3Wpp.mp4` (a 24-second screen recording; six frames were reviewed). What it shows:

- An off-white page with almost nothing on it: a small "History" pill at the top centre, one headline in a light-weight geometric sans ("what's on your mind?"), and one wide prompt box with a few tiny monospace hints and a square send button.
- The prompt box sits on a soft grey blurred halo, and the box itself is frosted, so the background shows through faintly.
- Behind everything, sea creatures (sharks, fish) drift slowly across the page. Each creature is a mosaic of tiny square tiles, with loose tiles scattering at its edges. They pass under the prompt box and blur where the halo covers them.

Take the structure and the mood, not the artwork: do not copy that product's creatures, name or wording. Lexigraph has a better reason for a tile mosaic than the reference does, because its model really does produce 64x64 pixel images. So the background is built from the product's own output:

- **Concept: "the model's pixels are alive."** The drifting shapes are made of tiles sampled from real 64x64 images the model generated (a bundled set of about 12 sample images, plus the visitor's own recent results once they have some). Shapes are simple silhouettes stored as small bitmasks (about 40x16 cells): birds, fish, dogs, boats, which are things the training captions actually contain.
- **Signature moment.** When a generation finishes, the nearest tiles leave their shapes, swarm to the centre and assemble into the new 64x64 image, tile by tile, over about 900 ms. This replaces a progress spinner's last step and is the one animation people will remember and record.
- **Everything else stays still.** One headline, one prompt box, one row of real controls that appears only when the box is focused. No sidebar on the generate screen, no cards, no gradients.

Free typefaces (self-hosted, both under the SIL Open Font Licence; confirm the licence file when downloading): Geist or Manrope at weight 300 for the headline and 400 for body, Geist Mono or JetBrains Mono for the small hints and numbers.

Stack stays: React 18, Vite, Tailwind 3, framer-motion, react-router. No component library is added. Pages today: `Home`, `Dashboard`, `LoRAPage`, `UpscalePage`, `AdminPage`; components: `Sidebar`, `WorkspaceLayout`, `GenerationCard`, `GenerationProgress`, `RecentGenerations`, login, register and onboarding modals.

- **D1. UI audit (S).** Run the app, screenshot every page at 1440 and 390 wide, list: untrue statements (15 references to `sd15`/`sdxl`/`sd14`), dead controls (width, height, model, LoRA), missing states, contrast failures, keyboard traps. Output `docs/UI_AUDIT.md`. No code changes.
- **D2. Design tokens (S).** One source in `tailwind.config.js` and `index.css` variables: colour roles (background, surface, border, text, muted, accent, danger) for light and dark, a 4 px spacing scale, two font sizes for headings and one for body, radius, focus ring. Replace hard-coded colours. Light theme values to start from (tune for AA contrast): background `#FBFBF9`, surface `rgba(255,255,255,0.6)` with `backdrop-filter: blur(16px)`, border `rgba(0,0,0,0.08)`, text `#1A1A1A`, muted `#8A8A86`, accent `#1A1A1A` (the send button is dark, not coloured), danger `#B3261E`. Dark theme: background `#0E0F10`, text `#EDEDEA`, same roles. The generated image is the only colourful thing on screen.
- **D3. Truthful generate screen (M).** Route `/`. Layout, top to bottom, all centred, max width 720 px:
  1. "History" pill, top centre, opens a panel (D6).
  2. Headline, weight 300, about 40 px: "what should the model draw?" (lowercase, like the reference).
  3. Prompt box: textarea that grows to 4 lines, placeholder "a red bird on a branch", mono hints at the right ("enter to generate", "shift+enter for a new line"), dark square send button. The grey halo is a separate blurred element behind the box (`filter: blur(60px)`, about 8% black).
  4. On focus, one row slides open under the box: steps (1 to 50), guidance (1 to 6), seed with a dice button. These are the only controls. Remove model, width, height and LoRA controls.
  5. One mono line under that states the facts: "Lexigraph T2I · 16.3M parameters · 64x64 · trained from scratch · N of 20 left today" (from the `RateLimit-*` headers).
  6. Result: appears in place of the headline. The 64x64 image is shown pixel-accurate (`image-rendering: pixelated`) at 256 px, with a toggle to the resampled 4x view labelled "enlarged, no added detail". Buttons: download, reuse settings, new.
- **D3b. Animated mosaic background (M).** New `client/src/components/MosaicField.tsx`, one `<canvas>` fixed behind the page, `pointer-events: none`, `aria-hidden="true"`.
  - Data: `client/src/assets/shapes.ts` holds 6 to 8 silhouettes as arrays of strings (`'..##..'`), and `client/src/assets/tiles/` holds about 12 sample 64x64 PNGs from the model. At start, draw each PNG once to an offscreen canvas so tiles can be copied with `drawImage` (no per-frame image decoding).
  - Model: 5 to 7 "swimmers" on desktop, 3 on mobile. Each has a position, a heading, a speed of 12 to 30 px per second, a shape, a source image and a cell size of 6 to 9 px. Each frame: advance along the heading, add a slow sine wobble to the heading, wrap around the edges with a margin. Each `#` cell draws one tile from the source image (the tile at the matching relative position, so the creature looks like a cut-out of a real picture). Edge cells flicker: skip drawing with a probability that changes every 400 ms, and draw 10 to 20 loose 2 px dots trailing behind.
  - Assembly: an exported `assemble(imageUrl)` function. On call, pick 256 tiles from the nearest swimmers, tween each to its slot in a 16x16 grid at the result position over 900 ms (ease-out, staggered by distance), then cross-fade to the real image. On "new", the tiles disperse back.
  - Cost controls: `requestAnimationFrame` capped at 30 fps; stop when `document.hidden`; cap `devicePixelRatio` at 2; with `prefers-reduced-motion: reduce` draw one static frame and skip the assembly animation (cross-fade only); a "pause background" control in the footer, remembered in localStorage.
  - No libraries. Plain Canvas 2D is enough for a few thousand small `drawImage` calls per frame. Do not add three.js, pixi or a particle library.
  - Check: Chrome performance panel shows main-thread work under 4 ms per frame on a mid-range laptop; Lighthouse performance stays at or above 90; with reduced motion on, nothing moves; the page is fully usable with the canvas removed.
- **D4. Real progress (M).** Server: `GET /api/jobs/:id/events` as Server-Sent Events, fed by per-step progress from ml_service (ml_service streams or the job polls a `/ml/progress/:id` endpoint; choose the simpler one that works with Flask under waitress). Client: replace `useJobPolling` with `EventSource`, fall back to polling on error. Delete the random progress ticker in `jobQueue.ts`.
- **D5. Every state designed (M).** For generate, history, upscale and admin: loading skeleton, empty state with one next action, and specific error messages for 400, 422 (prompt blocked, show which rule category), 429 (show the retry time from `Retry-After` as a countdown), 503 (model unavailable, auto-retry), network failure. Root error boundary. Toasts only for background events.
- **D6. History and detail (M).** Grid of own generations with prompt, seed, steps and guidance; "reuse settings" and "delete" on each; the transparency panel (original prompt, normalised prompt, policy flags) from `/api/jobs/transparency/:requestId`.
- **D7. Accessibility and responsive pass (M).** Keyboard reach and visible focus on every control, labelled inputs, `aria-live` for job status, reduced-motion respected, contrast AA in both themes, layouts at 390, 768 and 1440. Run axe in a Playwright smoke test (one e2e: open, type prompt, generate, image appears) and add it to CI.
- **D8. Auth and token handling (S).** Audit M2: access token in memory, silent refresh on load, CSP header served by nginx.

## 9. Phase E: model, weights and release

- **E1. Publishable dataset (L, needs D2).** Pick a dataset whose licence allows redistribution of trained weights and verify the terms yourself before training; candidates to evaluate are Open Images with Localized Narratives captions, and CC0 or public-domain collections. Record the exact source, licence text and download date in `docs/MODEL_CARD.md`. Retrain on Kaggle with the same config; publish the loss curve and a fixed-seed sample grid.
- **E2. Reproducible training (M).** `training/` with one entry command, a pinned `requirements.txt`, a config file, fixed seeds, checkpoint export to `safetensors`, and an eval script that renders the same 16 prompts at fixed seeds. `docs/TRAINING.md` states hardware, wall time and expected results.
- **E3. Release (S).** Tag `v0.1.0`, GitHub release with the weights file and its SHA-256, changelog, a 30-second screen recording in the README. Only after phases A to C are complete and E1 is done (or the release is code only).
- **E4. Hosted demo (M, needs D4).** Only with the retrained weights, all critical and high audit items closed, the proxy and `TRUST_PROXY` set correctly, and a stated content policy.

## 10. Order and size

| Order | Task | Size | Depends on |
|---|---|---|---|
| 1 | A0 finish P1 | S | none |
| 2 | A1 critical fixes | S | A0 |
| 3 | B1 secrets and first commit | S | owner rotates secrets |
| 4 | A2 identity and limits | M | A1 |
| 5 | C1 test harness | M | A0 |
| 6 | A3, A4 | M each | A2 |
| 7 | C2, C3 | M each | C1 |
| 8 | B2 to B5 | M total | D1, D5 |
| 9 | C4, C5, C6 | M, S, M | C3 |
| 10 | D1 to D8 | S to M each | A3 (so cut features are gone before redesign) |
| 11 | E1 to E4 | L, M, S, M | D2, D4 |

## 11. Definition of done for "open-source ready"

1. `docker compose up` on a clean machine produces an image, following only the README.
2. CI is green: typecheck, build, unit and integration tests at 80% on server logic, audit, secret scan.
3. No critical or high finding in `docs/SECURITY_AUDIT.md` is open; each closed one has a test.
4. Nothing in the UI or README claims more than the model does.
5. Licence, security policy, contributing guide, model card and changelog exist and are accurate.
6. Published weights, if any, come from a dataset whose licence was checked and recorded.

## 12. Running it in production for free

Constraint from the owner: no paid resources. A GPU is never free, so the design has to remove the need for one. The model is small enough to make that possible: 16.3M parameters at 64x64 is roughly 65 MB of 32-bit weights, and a 30-step sample is light work for a CPU.

Free-tier limits change. Every service below must be checked on its pricing page on the day of sign-up; the numbers are not quoted here on purpose. Prefer services that do not ask for a card.

### Recommended: two modes, one codebase

| Mode | Where the model runs | Cost | Use |
|---|---|---|---|
| **Browser mode** (default for the public demo) | In the visitor's browser, via ONNX Runtime Web (WebGPU, with WASM fallback) | Nothing. No server compute at all | Public demo, resume link |
| **Server mode** (what exists today) | ml_service on CPU, behind the API and its guardrails | Free tier of a container host | Self-hosting, the "full stack" story, API users |

Why browser mode is the centrepiece: it costs nothing however many people use it, there is no queue to abuse, prompts never leave the visitor's machine, and "a text-to-image model I trained from scratch that runs entirely in your browser" is a stronger line than any hosted demo. Server mode keeps every piece of the engineering (queue, quotas, breaker, audit) real and demonstrable.

### Tasks

- **F1. Feasibility spike for browser mode (M). Do this before promising it.** Export the denoiser and the text encoder to ONNX (`torch.onnx.export`, fixed 64x64, dynamic batch of 2 for guidance). Port the tokenizer (vocabulary JSON already exists) and the flow-matching sampler loop to TypeScript: it is a short Euler loop plus the guidance mix. Measure in Chrome on the owner's laptop: download size, time to first image on WebGPU and on WASM. Success: under 40 MB after 16-bit float conversion and under 10 seconds per image on WASM. If it fails, drop browser mode and ship server mode only; say so in the README.
- **F2. Browser mode build (M).** `client/src/lib/localModel.ts` (load, cache in the Cache API, generate with a per-step callback, which gives real progress for free), a Web Worker so the page stays smooth, a mode switch in the footer. History is stored in IndexedDB on the device. The prompt policy file is shared with the server (move `promptPolicy.ts` to a small shared folder imported by both).
- **F3. Free hosting for the static client (S).** Any static host with a free tier: GitHub Pages, Cloudflare Pages or Vercel hobby. GitHub Pages needs no extra account and deploys from a GitHub Actions workflow. Model files go in a GitHub release or on the Hugging Face Hub (free for public models) and are fetched from there.
- **F4. Free hosting for server mode (M).** One Docker container that runs both the API and ml_service (ml_service on `127.0.0.1`, never published, which also closes audit C2), CPU-only PyTorch wheels to keep the image small. Candidate hosts with a free CPU tier: Hugging Face Spaces (Docker Space) first; Render or Koyeb as alternatives. Expect the container to sleep when idle and wake slowly, and expect the disk to be wiped on restart. Therefore: generated images are returned to the browser and kept there (IndexedDB), and the server stores metadata only, with a short retention. Database: Neon free tier (already in use). Set `TRUST_PROXY` to match the host.
- **F5. Free operations (S).** CI on GitHub Actions (free for public repositories). Uptime check with a free monitor. Errors go to the structured logs; do not add a paid error tracker. Dependabot and secret scanning are free on public repositories.
- **F6. Abuse budget (S).** Server mode on a free tier dies quickly under abuse, so tighten for the hosted instance through environment variables, not code forks: anonymous quota 10 per day per IP, queue cap 5, one job at a time, steps capped at 30. Add a banner: "Server mode is a small shared demo. Browser mode is unlimited."

### What stays out, because it costs money

Custom domains (use the host's free subdomain), GPU hosting, object storage that requires a card, paid monitoring, email sending for verification (accounts stay optional and unverified on the demo; say so).

## 13. Making it count on a resume

A reviewer gives a repository about a minute. Design for that minute.

- **First screen of the README:** the screen recording of the assembly animation (under 10 seconds, as a GIF or video), one sentence, the live link, and a four-line "what I built" list: the model (architecture, parameters, steps, hardware, hours), the training pipeline, the serving stack (queue, quotas, breaker, audit), the browser runtime.
- **Numbers, all measured and reproducible:** parameters, training hours and hardware, time per image on GPU, CPU and browser, model download size, test coverage, p50 and p95 latency from the metrics endpoint. Do not state a number that a command in the repository cannot reproduce.
- **`docs/ARCHITECTURE.md` with one diagram** and a short "decisions and trade-offs" section: why flow matching, why Postgres for the queue and rate limits instead of Redis, why fixed-window limits, why a regex policy and what it cannot do. Interviewers ask about trade-offs; the honest limits are an asset.
- **`docs/SECURITY_AUDIT.md` stays public** with each finding marked fixed and linked to its test. A self-audit with fixes is rare in portfolio projects.
- **A write-up** (one post, linked from the README): "Training a text-to-image model from scratch on a 6 GB GPU": what failed, loss curves, sample grids at 10k, 50k and 100k steps.
- **Contributor experience:** five or more issues labelled "good first issue" at launch (new silhouettes for the background, a new sampler, translations of the prompt policy tests), a working `docker compose up`, replies to issues within a few days.
- **Resume bullets to earn (write them only once true):** designed and trained a 16.3M-parameter flow-matching text-to-image model from random initialisation on a single 6 GB GPU; shipped it as an open-source product that runs fully in the browser; built the serving stack with Postgres-backed rate limits, admission control and a circuit breaker; ran and closed a security audit of N findings with tests.

## 14. Revised order with the free and resume work

1. A0, A1, B1 (compiles, critical holes closed, safe first commit).
2. F1 (the spike decides the shape of everything after it).
3. A2, C1, A3, A4 (identity, tests, cut dead features).
4. D1, D2, D3, D3b (the new screen and the background). This is the visible milestone; record the video here.
5. F2, D4 to D8 (browser mode, real progress, states, history, accessibility).
6. C2 to C6, B2 to B5 (integration tests, migrations, containers, CI, docs).
7. E1, E2 (publishable dataset and retrain), then F3, F4, F5, F6, E3 (deploy and release).

Nothing public (demo, weights or video of generated images) ships on the Flickr8k checkpoint. Until E1 is done, the public repository can still go up as code plus training instructions.
