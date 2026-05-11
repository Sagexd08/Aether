# Sprint 2: Generation Studio — Design Spec

**Date:** 2026-05-11  
**Sprint:** 2 of 4  
**Status:** Approved  
**Builds on:** Sprint 1 (Auth/Foundation) — JWT auth, rotating refresh tokens, WorkspaceShell, WebSocket, TanStack Query QK factory, Zustand auth store

---

## Overview

Sprint 2 delivers the core generation pipeline for AETHER: a cinematic multimodal AI studio where users submit prompts and receive generated images, videos, and audio. The generation lifecycle — not the gallery — is the primary deliverable. The gallery is a derived projection of persisted generation state.

**Modes wired in Sprint 2:** Image, Video, Audio  
**Text generation:** polished "coming next sprint" placeholder  
**Layout:** Side-by-side — controls panel left, output panel right, generation history below

---

## Product Philosophy

- **Generation system is source of truth.** The gallery is an indexed view over it, never a write path.
- **Jobs separated from assets.** One job may produce many assets (future: batches, video+thumbnail, audio+transcript).
- **Stage-aware lifecycle.** Eight statuses drive animated UI transitions — not just loading/success/failed.
- **Hybrid persistence.** Image: sync HTTP (3–8s). Video/audio: async job + WebSocket-driven updates.
- **Immutable records.** Prompts and generation configs never mutate after creation. Retries clone, not edit.
- **Provider abstraction.** HF Inference API in Sprint 2, but zero HF-specific semantics above the provider layer.

---

## Data Model

### `generation_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(36) PK` | UUID |
| `user_id` | `FK → users` | |
| `workspace_id` | `FK → workspaces` | |
| `project_id` | `VARCHAR(36) NULLABLE` | Sprint 3 wires this |
| `mode` | `ENUM(image,video,audio,text)` | |
| `prompt` | `TEXT` | Immutable after creation |
| `negative_prompt` | `TEXT NULLABLE` | |
| `model` | `VARCHAR(100)` | e.g. `FLUX.1-schnell` |
| `provider` | `VARCHAR(50)` | e.g. `huggingface` |
| `seed` | `BIGINT NULLABLE` | Reproducibility |
| `status` | `ENUM(queued,preprocessing,running,postprocessing,persisting,completed,failed,cancelled)` | |
| `progress` | `INTEGER DEFAULT 0` | 0–100, stage-mapped (see below) |
| `error_message` | `TEXT NULLABLE` | |
| `last_error_code` | `VARCHAR(100) NULLABLE` | Machine-readable error class |
| `retry_count` | `INTEGER DEFAULT 0` | |
| `cancel_requested` | `BOOLEAN DEFAULT false` | Cooperative cancellation |
| `credits_cost` | `INTEGER NULLABLE` | Reserved at queued, finalized at completed |
| `idempotency_key` | `VARCHAR(64) UNIQUE NULLABLE` | Client-provided, dedup window |
| `input_asset_ids` | `JSONB NULLABLE` | img2img, style ref, conditioning (Sprint 3+) |
| `metadata` | `JSONB DEFAULT '{}'` | CFG scale, scheduler, aspect ratio, FPS, etc. |
| `visibility` | `ENUM(private,unlisted,public) DEFAULT private` | |
| `preview_storage_key` | `TEXT NULLABLE` | Thumbnail/waveform before completion |
| `started_at` | `TIMESTAMP NULLABLE` | |
| `completed_at` | `TIMESTAMP NULLABLE` | |
| `created_at` | `TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | |

**Progress stage mapping (non-linear, perceived responsiveness over accuracy):**

| Status | Progress |
|---|---|
| `queued` | 0 |
| `preprocessing` | 10 |
| `running` | 20–80 |
| `postprocessing` | 90 |
| `persisting` | 95 |
| `completed` | 100 |
| `failed` / `cancelled` | unchanged |

### `assets`

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(36) PK` | UUID |
| `generation_job_id` | `FK → generation_jobs` | |
| `user_id` | `FK → users` | |
| `workspace_id` | `FK → workspaces` | |
| `generation_index` | `INTEGER DEFAULT 0` | Position within multi-output job |
| `type` | `ENUM(image,video,audio)` | |
| `storage_key` | `TEXT` | Derive signed URLs dynamically — never store URLs directly |
| `mime_type` | `VARCHAR(50)` | |
| `file_size_bytes` | `INTEGER NULLABLE` | |
| `width` | `INTEGER NULLABLE` | Image/video |
| `height` | `INTEGER NULLABLE` | Image/video |
| `duration_seconds` | `FLOAT NULLABLE` | Video/audio |
| `metadata` | `JSONB DEFAULT '{}'` | Extended params escape hatch |
| `is_favorite` | `BOOLEAN DEFAULT false` | |
| `visibility` | `ENUM(private,unlisted,public) DEFAULT private` | |
| `created_at` | `TIMESTAMP` | |

### `generation_job_inputs`

Separate table (not JSONB) for FK integrity and future remixing lineage.

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(36) PK` | |
| `generation_job_id` | `FK → generation_jobs` | |
| `asset_id` | `FK → assets` | |
| `role` | `VARCHAR(50)` | `reference`, `init_image`, `mask`, `style`, `conditioning_audio` |

### `users` additions

| Column | Type | Notes |
|---|---|---|
| `credits_reserved` | `INTEGER DEFAULT 0` | Credits locked for in-flight jobs |

Credit lifecycle: **reserve at `queued`** (decrement `credits_available`, increment `credits_reserved`) → **finalize at `completed`** (decrement `credits_reserved`) → **release at `failed|cancelled`** (restore `credits_available`).

---

## Backend API

### New router: `backend/api/src/routers/generation.py`

Public routes stay mode-split for Sprint 2. All internally route through a unified `GenerationService.dispatch(job)` — `POST /api/generation` (unified) becomes the public API in Sprint 3+.

#### Image generation (sync)

```
POST /api/generation/image
Authorization: Bearer <token>
Idempotency-Key: <nanoid>   (optional, client-provided)

Body: {
  prompt: string
  negative_prompt?: string
  model?: string             (default: "black-forest-labs/FLUX.1-schnell")
  seed?: number
  metadata?: object          (aspect_ratio, guidance_scale, etc.)
}

Response 200: {
  job: GenerationJob
  asset: Asset
}
Response 402: insufficient credits
Response 409: duplicate idempotency key (returns existing job+asset)
```

Flow: create job (status=queued, reserve credits) → call HF sync → update status through preprocessing→running→postprocessing→persisting→completed → create asset record → finalize credits → return.

#### Video generation (async)

```
POST /api/generation/video
Authorization: Bearer <token>
Idempotency-Key: <nanoid>

Body: { prompt, model?, seed?, metadata? }

Response 202: { job_id: string, status: "queued" }
```

Background task drives full lifecycle. Each status transition publishes WS event (see below).

#### Audio generation (async)

```
POST /api/generation/audio
Authorization: Bearer <token>
Idempotency-Key: <nanoid>

Body: { prompt, model?, seed?, metadata? }

Response 202: { job_id: string, status: "queued" }
```

Same async pattern as video.

#### Gallery feed

```
GET /api/generation/jobs
  ?workspace_id=<id>
  &mode=image|video|audio|text     (optional filter)
  &status=completed|failed|...     (optional filter, comma-separated)
  &cursor=<last_created_at,id>     (keyset pagination — never offset)
  &limit=20

Response 200: {
  jobs: GenerationJob[]            (each includes assets[])
  next_cursor: string | null
}
```

#### Single job

```
GET /api/generation/jobs/:id
Response 200: { job: GenerationJob, assets: Asset[] }
```

#### Cancel / delete

```
DELETE /api/generation/jobs/:id
→ if running: sets cancel_requested=true, worker cooperatively stops
→ if completed/failed: hard delete job + assets + storage objects
→ releases reserved credits
```

#### Favorite toggle

```
PATCH /api/generation/assets/:id/favorite
Response 200: { is_favorite: boolean }
```

#### Reconciliation (used by frontend on mount)

```
GET /api/generation/jobs?workspace_id=<id>&status=queued,preprocessing,running,postprocessing,persisting
Response 200: { jobs: GenerationJob[] }
```

### WebSocket event envelope (canonical)

All generation events use this shape on the existing `/ws/{workspace_id}` channel:

```json
{
  "type": "generation.progress" | "generation.completed" | "generation.failed",
  "jobId": "...",
  "workspaceId": "...",
  "ts": 1715000000000,
  "payload": {
    "status": "running",
    "progress": 42,
    "job": { ... },     // included on generation.completed
    "assets": [ ... ]   // included on generation.completed (full hydrated payload, no refetch needed)
  }
}
```

### Provider abstraction

```python
class InferenceProvider(Protocol):
    async def generate(self, job: GenerationJob) -> AsyncIterator[ProviderUpdate]: ...
```

`HuggingFaceProvider` implements this interface. Zero HF-specific semantics leak above the provider layer. Future providers (Replicate, Fal, RunPod, local diffusers) drop in by implementing the same protocol.

**Sprint 2 models:**
- Image: `black-forest-labs/FLUX.1-schnell`
- Video: `Wan-AI/Wan2.1-T2V-1.3B`
- Audio: `facebook/musicgen-small`

### Credit costs (Sprint 2 defaults, configurable via metadata)

| Mode | Cost |
|---|---|
| Image | 10 credits |
| Video | 50 credits |
| Audio | 20 credits |

---

## Frontend Architecture

### New route

```
frontend/app/src/app/workspace/generate/page.tsx
```

Renders `WorkspaceShell` wrapping a two-panel layout.

### New components

```
src/components/generate/
  controls-panel.tsx           mode tabs, prompt textarea, negative prompt, seed input, Generate button
  output-panel.tsx             dispatcher: renders correct output component by mode + job state
  outputs/
    image-output.tsx           shimmer → image fade-in, download / copy / favorite controls
    video-output.tsx           stage labels → HTML5 player with poster, download / favorite
    audio-output.tsx           waveform visualizer → audio player with waveform, download / favorite
    text-coming-soon.tsx       polished "Available in next sprint" panel (not broken, just staged)
  generation-card.tsx          unified card — active state OR history item
  generation-history.tsx       infinite scroll grid, mode filter chips, realtime prepend
```

### State model

Three distinct layers, each with a clear responsibility:

| Layer | Tool | Responsibility |
|---|---|---|
| Ephemeral orchestration | Zustand `useGenerationStore` | Active jobs, progress, focused job |
| Server state / cache | TanStack Query | Gallery feed, job details, cursor pagination |
| Realtime sync | WebSocket (`useWorkspaceWebSocket`) | Drive store updates, trigger cache updates |

**Zustand does not act as a database.** It holds only transient in-flight state.

### `useGenerationStore` shape

```ts
interface GenerationStore {
  activeJobs: Record<string, ActiveGenerationState>  // jobId → state
  focusedJobId: string | undefined
  setActiveJob: (job: ActiveGenerationState) => void
  updateProgress: (jobId: string, status: string, progress: number) => void
  completeJob: (jobId: string, assets: Asset[]) => void
  failJob: (jobId: string, error: string) => void
  hydrateFromServer: (jobs: GenerationJob[]) => void
  setFocusedJob: (jobId: string) => void
}
```

### On workspace mount — reconciliation

```ts
// Fetch any jobs still in-flight (survived page refresh / WS disconnect)
const inflight = await api.get('/api/generation/jobs?status=queued,...&workspace_id=...')
store.hydrateFromServer(inflight.jobs)
```

### OutputPanel data sourcing

```ts
// 1. Check activeJobs[focusedJobId] — transient store (handles live progress)
// 2. Fall back to TanStack Query job data — handles reload mid-generation
// OutputPanel never breaks on page refresh
```

### Generation flows

**Image (sync):**
```
user clicks Generate
→ store.setActiveJob({ status: 'queued', progress: 0 })  // optimistic card appears immediately
→ POST /api/generation/image  { Idempotency-Key: nanoid() }
→ response: { job, asset }
→ store.completeJob(job.id, [asset])
→ queryClient.setQueryData(QK.generation.jobs(...), prepend(job))  // optimistic prepend
→ OutputPanel renders completed image
```

**Video / Audio (async):**
```
user clicks Generate
→ store.setActiveJob({ status: 'queued', progress: 0 })
→ POST /api/generation/video|audio → { job_id }
→ WS generation.progress events → store.updateProgress(jobId, status, progress)
→ OutputPanel reactively renders current stage (animated stage label + progress bar)
→ WS generation.completed → store.completeJob(jobId, assets)
→ queryClient.setQueryData prepend  (full job+assets in WS payload, no extra refetch)
→ toast pill: "New generation ready — click to view"  (no auto-scroll)
```

### `GenerationCard` states

| State | Renders |
|---|---|
| `queued` | Animated pulse, "Queued…" label |
| `preprocessing` | Stage label, progress 10% |
| `running` | Stage label, animated progress bar 20–80% |
| `postprocessing` | Stage label, 90% |
| `persisting` | "Saving…", 95% |
| `completed` (image) | Thumbnail, hover: download / favorite / remix |
| `completed` (video) | Poster frame, duration badge, play on hover |
| `completed` (audio) | Waveform preview, duration, play on hover |
| `failed` | Error message, Retry button (clones config → new job) |
| `cancelled` | Cancelled label |

### `GenerationHistory`

- Infinite scroll via `useIntersectionObserver` sentinel
- Keyset cursor pagination (`created_at DESC, id`)
- Virtualized with `@tanstack/react-virtual` from the start (video cards + motion can be expensive)
- Mode filter chips: **All | Image | Video | Audio**
- `generation.completed` WS events prepend new cards via `AnimatePresence` (Framer Motion entrance)
- No auto-scroll on new completion — "New generation ready" pill anchored at top, click to jump
- User scroll position preserved at all times
- `is_favorite` toggle: optimistic update via `queryClient.setQueryData`, `PATCH /api/generation/assets/:id/favorite` in background

### Query cache strategy

- **Optimistic prepend:** `queryClient.setQueryData` on job creation and completion (no loading flash)
- **`invalidateQueries`** used only as reconciliation fallback (e.g., after reconnect, not after every event)
- This is critical for infinite scroll feeds — broad invalidation re-fetches entire cursor chain

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Insufficient credits | `402` from API; toast error "Not enough credits"; no job created |
| Duplicate idempotency key | `409` returns existing job+asset; frontend deduplicates silently |
| Inference provider error | Job set to `failed`, `error_message` + `last_error_code` populated; WS `generation.failed` event; card shows retry |
| WS disconnect during generation | On reconnect: reconciliation fetch restores active jobs in store |
| Asset CDN not ready on completed | Frontend: image `onError` triggers 3× retry with 1s backoff before showing broken-image state |
| Cancel requested | `cancel_requested=true`; worker exits after current stage; credits released |

---

## Testing Plan

**Backend:**
- Unit: `GenerationService.dispatch()` state machine transitions
- Unit: credit reserve/finalize/release logic
- Unit: idempotency key deduplication
- Integration: `POST /api/generation/image` end-to-end (mocked HF provider)
- Integration: async job background task status progression
- Integration: WS event publication on each status transition
- Integration: gallery cursor pagination (keyset correctness, mode filter)

**Frontend:**
- Unit: `useGenerationStore` — multi-job state, hydration, progress updates
- Unit: `GenerationCard` renders all 8 states correctly
- Integration: image generation flow (mock API) — optimistic card → complete
- Integration: video generation flow (mock WS) — stage transitions → complete
- Integration: gallery reconciliation on mount with in-flight jobs
- Integration: scroll position preserved when new generation completes

---

## Out of Scope for Sprint 2

These belong in Sprint 3+ once generation semantics stabilize and user behavior is observable:

- Text generation (placeholder only)
- Collections, folders, drag-and-drop organization
- Bulk operations
- Advanced metadata editing
- Project-scoped gallery (schema ready, UI not wired)
- Public/unlisted visibility (column exists, UI not exposed)
- `generation_job_inputs` (schema exists, img2img UI not built)
- Multi-output batches
- Sharing / remix flows
- CDN / signed URL infrastructure (Sprint 2 uses direct HF base64 in dev)

---

## Implementation Order

Following Approach A — generation pipeline first, gallery derived:

1. **DB migrations** — create `generation_jobs`, `assets`, `generation_job_inputs` tables; add `credits_reserved` to `users`
2. **Backend models + schemas** — SQLAlchemy models, Pydantic schemas
3. **`InferenceProvider` protocol + `HuggingFaceProvider`** — image sync, video/audio async polling
4. **`GenerationService`** — unified dispatch, state machine, credit reserve/finalize, WS publish
5. **Generation router** — image, video, audio endpoints + gallery feed + cancel + favorite
6. **Backend tests** — unit + integration
7. **`useGenerationStore`** — Zustand multi-job store + reconciliation hook
8. **`ControlsPanel` + `OutputPanel` + mode output components** — studio UI
9. **`GenerationCard`** — unified card with all 8 states
10. **`GenerationHistory`** — infinite scroll, virtualization, realtime prepend, filter chips
11. **`/workspace/generate` page** — assemble panels, wire reconciliation on mount
12. **Frontend tests** — store unit tests, component integration tests
