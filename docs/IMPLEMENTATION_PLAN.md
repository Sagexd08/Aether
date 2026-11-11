# Lexigraph implementation plan (merged)

Date: 2026-11-11. Merges `docs/OPEN_SOURCE_PLAN.md` (product, tracks A to F) and `docs/ml/BUILD_PLAN.md` (model, tasks M and R). Those two stay the specs; this file only fixes the order, the hand-offs between them, and the gates. Nothing in the ML docs has been run: every gain is a hypothesis until M0.1 prints numbers.

## 1. Tracks

Two tracks run in parallel because they share almost no files.

| Track | Where | Spec | Runs on |
|---|---|---|---|
| **P** product (server, client, infra) | `server/`, `client/`, `docker/` | OPEN_SOURCE_PLAN | laptop, Windows |
| **M** model (data, training, research) | `training/`, `models/`, `ml_service/t2i_service.py` | ml/BUILD_PLAN | laptop for code, Kaggle for long runs |

Interface points (the only places the tracks touch; change them deliberately):
1. `models/registry.json` (M8.3): ml_service and the browser read model files from it. Until it exists ml_service keeps loading the current checkpoint.
2. Checkpoint format: M0.2 moves to `safetensors` and `weights_only=True`. This also closes audit H6, so it is shared with A4. `ml_service/t2i_service.py` must change in the same task.
3. ONNX export (M8.4) feeds browser mode (F1/F2).
4. UI background tiles (D3b) must come from a model trained on licensed data (after M1 + M3.1), not the Flickr8k model.
5. Prompt policy file is shared by server and browser (F2).

## 2. Decisions to lock before the tasks they block

Defaults let work start; the owner can overrule at any time.

| # | Decision | Default | Blocks |
|---|---|---|---|
| D1 | Code licence | Apache-2.0 (fix `package.json`) | B2 |
| D2 | Publish weights | Code only until retrain on PD12M | E3 |
| D3 | Keep LoRA | Cut it | A3 |
| D4 | Public demo | Browser mode only | F3 |
| R1 | Pretrained net for measurement (FID) | No; use FD-judge, labelled non-comparable | M6.2 |
| R2 | Captions | PD12M, disclosed as machine-written | M1 |
| R3 | Kaggle hours per week | Unknown: ask before M3.2 and M3.3 | L tasks |

## 3. Milestones (each leaves a working system; stop after any)

| Milestone | Tasks | Outcome |
|---|---|---|
| **0. Green tree** | A0, A1 | Server starts, critical findings closed |
| **1. Safe first commit** | B1 | Secrets rotated, gitleaks clean, `git init` |
| **2. Measured baseline** | M0.1, M0.2 | Numbers for the Flickr8k model; resumable runs; 4 checkpoints per run |
| **3. Real data** | M1 (7 scripts), M3.1 | 300k PD12M pairs; recipe ablations; first honest model |
| **4. Judge + metrics** | M6.1, M6.2 | Agreement, FD-judge, rerank, memorisation |
| **5. Research result** | M3.2, M3.4, R1, R2 | LexiT, guidance table, Foresight H1/H2 verdict |
| **6. Visible product** | A2, C1, A3, A4, D1, D2, D3, D3b | New screen + mosaic background; record the video |
| **7. Browser mode** | M8.3, M8.4, M2.5, F1, F2, D4 to D8 | Model runs in the browser, real progress |
| **8. Hardened repo** | C2 to C6, B2 to B5 | Tests 80%, migrations, containers, CI, docs |
| **9. Codec** | M2.1 to M2.4 | `.lexi` format, rate-distortion plot, image-in-URL |
| **10. 256 and speed** | M3.3, M4.1, M4.3, M7.x | 256x256, preview-as-you-type, inspectable demo |
| **11. Release** | E2, E3, F3 to F6, R3, R4 | Weights, demo, write-up |

Milestones 2 to 5 (model) and 6 to 8 (product) can alternate by session. Rule of thumb: a Kaggle run in the background while product tasks are built on the laptop.

## 4. Start here: A0 (size S), the first session

Do not touch the ML track until the tree compiles.

Files and exact work are in OPEN_SOURCE_PLAN section 5, A0. Confirmed this session: `server/src/routes/ml.ts` line 2 imports `generateRateLimiter` (used at lines 24 and 53), which no longer exists in `middleware/rateLimit.ts`, so the server fails to start.

Order inside A0:
1. `ml.ts`: import `generateIpLimiter`, swap both uses (the file is deleted later in A3).
2. `lora.ts`: `validateBody(loraCreateSchema)` on `POST /`; drop the redundant manual check in `PUT /:id`.
3. `prompts.ts`: `validateParams(idParamSchema)` on `GET /:id`.
4. `admin.ts`: `audit(req, action, target)` in each handler; `GET /metrics` returning `snapshot()` plus `breakerStatus()`.
5. `auth.ts` middleware: `adminAuth` header-only with `timingSafeEqual`.
6. Replace remaining `console.*` with `logger` in `index.ts`, `jobQueue.ts`, `imageGen.ts`.
7. Check: `npx tsc -p server/tsconfig.json --noEmit` prints nothing; then the six behaviour checks listed in A0 (202 + job completes, 429 with `Retry-After`, 422 + `guard_events` row, `cfg_scale: 9` gives 400, breaker opens to 503, client accepts 202).

Hand-off: paste command output into the note; do not commit.

## 5. Model track in build order, with gates

Gate = condition that must hold before the next task starts.

| # | Task | Size | Gate to proceed |
|---|---|---|---|
| 1 | M0.2 configs, run index, 4 checkpoints, safetensors | S | 200-step CPU smoke run produces 4 checkpoints and resumes after kill at 100 |
| 2 | M0.1 eval harness | M | Two runs give identical `eval.json`; Flickr8k baseline in `RESULTS.md` |
| 3 | M1 scripts 1-2 (`fetch_metadata`, `download`) | M | Column names confirmed on the dataset card; licence text saved to `data/provenance/` first |
| 4 | M1 scripts 3-5 (`dedup`, `split`, `tokenizer`) | M | pytest on 50-image fixture; BPE round-trips 1,000 captions |
| 5 | M1 scripts 6-7 (`pack`, `report`) + `loader.py` | M | `index.json` at least 280k train pairs; `DATA_CARD.md`; 20k-step UNet run gives a recognisable grid |
| 6 | M3.1 ablations (6 one-change runs, then combined 100k) | M | Combined beats baseline in 7 of 10 timestep bins, else keep baseline |
| 7 | M6.1 judge | M | Recall@10 far above 0.2% chance |
| 8 | M6.2 metrics | S | Matched agreement clearly above shuffled, else judge is unusable as a metric |
| 9 | M3.2 LexiT | L | Unit tests pass; 100k-step comparison with UNet; keep the winner |
| 10 | M3.4 guidance + sampler | M | Default written to registry |
| 11 | R1, R2 Foresight | M, S | Needs saved checkpoints at s, 2s, 4s from a full run. Second literature search recorded in `FORESIGHT.md` first |
| 12 | M8.3, M8.4 registry, ONNX | S, M | ONNX within 1e-3 of PyTorch; shared tokenizer test vectors |

M3.1 ablation reminder: run one change at a time, same seed, 20k steps, judged only by M0.1.

Budget realism (nothing here was checked):
- Each ablation and 100k run is GPU hours. On the RTX 3050 6 GB the 64x64 UNet is feasible; LexiT, M3.3 and R3 are planned for Kaggle.
- Do not start M3.2, M3.3, R3 or M4.2 until decision R3 (Kaggle hours) is answered.

## 6. Product track in build order

Follow OPEN_SOURCE_PLAN section 14 with these adjustments from the merge:

- **A3 (cut dead surface)** also deletes the Flask routes `/ml/refine-prompt`, `/ml/generate-control`, `/ml/models*`, `/ml/metrics`. Leave `t2i_service.py` alone: M0.2 edits it.
- **F1 (browser spike)** waits for M8.4 (ONNX export). Do not hand-roll a separate export in F1.
- **D3b (mosaic)** may be built early with placeholder tiles; swap in tiles from the M3.1 model before recording the video or publishing.
- **D3 header line** ("16.3M parameters, 64x64") must be read from `models/registry.json`, not hard-coded, once LexiT replaces the UNet.
- **E1** is already covered by M1 + M3.1; do not run a second dataset task.
- **C2 acceptance** includes a test that a `registry.json` hash mismatch makes ml_service refuse to load.

## 7. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| PD12M download slow or items dead | 330k sampled for 300k target (10% spare); manifest makes download resumable |
| PD12M captions are machine-written | R2 disclosure in README and model card |
| M3.1 changes do not win | Keep the baseline; record the null result |
| Foresight fails | A documented negative result is a valid outcome (`FORESIGHT.md`) |
| MeanFlow unstable | M4.2 stops after three attempts and gets written up |
| Kaggle quota too small | Stop at milestone 4; skip M3.3, M5, M4.2 |
| Paper ids and numbers are from memory | Verify each before quoting publicly (RESEARCH.md marks which) |
| Context bloat across sessions | One task per session; `/clear` with a `HANDOFF.md` of at most 40 lines |

## 8. Per-session protocol

1. State size (S/M/L) in one line. Ask before L.
2. Read only the task's section of the spec and the files it names.
3. Delegate a specified task (more than 3 files or 150 lines) to `sonnet-builder` with files, behaviour and the check; otherwise do it directly.
4. Run the task's check once at the end; paste the output.
5. Write or update `HANDOFF.md` (at most 40 lines); suggest `/clear`.
6. Do not commit unless the owner says so.

## 9. Definition of done

Product: OPEN_SOURCE_PLAN section 11. Model: every task has its check output recorded in `docs/ml/RESULTS.md`; `eval.json` exists for every promoted run; the registry names the current `full`, `preview`, `codec` and `judge`; `FORESIGHT.md` has a verdict row for H1 to H4.
