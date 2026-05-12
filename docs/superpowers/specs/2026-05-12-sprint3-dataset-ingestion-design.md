# Sprint 3: Dataset Ingestion Pipeline — Design Spec

**Date:** 2026-05-12
**Sprint:** 3 of 4
**Status:** Approved
**Builds on:** Sprint 1 (Auth/Foundation), Sprint 2 (Generation Studio — async pattern, WS events, Zustand store, TanStack Query)

---

## Overview

Sprint 3 delivers a fully wired dataset ingestion pipeline for AETHER. Users register datasets from HuggingFace or Kaggle by reference; the backend fetches metadata, computes quality signals from sample rows, and stores a preview — without downloading the full dataset. The ingestion lifecycle mirrors Sprint 2's generation job pattern exactly: async background task, stage-aware WS events, Zustand ephemeral state, TanStack Query for persistence.

**Sources wired in Sprint 3:** HuggingFace, Kaggle
**Local upload:** "coming in next sprint" placeholder (connector stub exists)
**Scope:** Metadata + preview only — no full download, no offline storage

---

## Product Philosophy

- **Pipeline is source of truth.** The dataset console is a derived view over ingestion state — same principle as Sprint 2's gallery.
- **Async-first.** Import returns immediately; background task drives all network work and publishes WS events.
- **Quality signals from samples.** All quality metrics are computed from fetched preview rows — no full dataset download needed.
- **Reference model.** Datasets are registered by source+ref. Sprint 4 training workers pull from the source directly at training time.
- **Immutable records.** Dataset records are never mutated after creation except via status transitions. Re-ingestion creates a new record.

---

## Data Model

### `datasets` additions (ALTER TABLE only — no new tables)

| Column | Type | Notes |
|---|---|---|
| `progress` | `INTEGER NOT NULL DEFAULT 0` | 0–100, stage-mapped |
| `error_message` | `TEXT NULLABLE` | Human-readable failure reason |
| `last_error_code` | `VARCHAR(100) NULLABLE` | Machine-readable error class |
| `ingestion_config` | `JSONB NOT NULL DEFAULT '{}'` | Future: filters, split ratios, schema overrides |
| `sample_count` | `INTEGER NOT NULL DEFAULT 0` | Actual preview rows fetched |
| `deleted_at` | `TIMESTAMP NULLABLE` | Soft-delete |

**Status lifecycle expanded:**

| Status | Progress | Meaning |
|---|---|---|
| `queued` | 0 | Created, background task not yet started |
| `inspecting` | 20 | Fetching column schema and row count from source |
| `analyzing` | 60 | Computing quality signals from sample rows |
| `previewing` | 90 | Fetching and storing preview rows |
| `completed` | 100 | All done, fully usable |
| `failed` | unchanged | Terminal failure, error_message set |

**`quality_report` JSONB shape** (stored in existing column):

```json
{
  "null_rates": { "column_name": 0.03 },
  "duplicate_estimate": 0.02,
  "media_types_detected": ["image", "text"],
  "language": "en",
  "language_confidence": 0.97,
  "row_count_verified": 12500,
  "sample_count": 50
}
```

**`preview_samples` JSONB** — up to 50 rows as `list[dict]` (existing column, now actually populated).

**`lineage` JSONB** — populated on completion:
```json
{
  "source": "huggingface",
  "source_ref": "imdb",
  "fetched_at": "2026-05-12T10:00:00Z",
  "connector_version": "1.0"
}
```

---

## Backend Pipeline

### New file: `backend/api/src/services/dataset_ingestion.py`

Single entry point: `run_ingestion(db, redis, dataset)` — drives the full lifecycle.

#### Stage 1 — Inspect (`queued → inspecting`, progress 0→20)

- Calls upgraded `inspect_huggingface_dataset()` or `inspect_kaggle_dataset()` from `dataset_connectors.py`
- Connectors upgraded to return sample rows alongside schema (currently return metadata only)
- Extracts: column schema (name, dtype, nullable), row count, detected media types
- Stores in `dataset.columns`, `dataset.row_count`, `dataset.media_types`
- Publishes `dataset.progress` WS event

#### Stage 2 — Analyze (`inspecting → analyzing`, progress 20→60)

- New `compute_quality_signals(columns, preview_rows)` pure function
- Computes from the sample rows fetched in Stage 1:
  - **Null rates:** per-column null/empty fraction
  - **Duplicate estimate:** fraction of rows with identical hash (SHA-256 of full row JSON)
  - **Language detection:** on first text column using `langdetect` library (fallback: `"unknown"` if unavailable)
  - **Media type verification:** confirm declared media types match actual sample row content
- Stores result in `dataset.quality_report` JSONB
- Publishes `dataset.progress` WS event

#### Stage 3 — Preview (`analyzing → previewing`, progress 60→90)

- Fetches up to 50 sample rows from HF/Kaggle (may reuse rows already fetched in Stage 1)
- Stores in `dataset.preview_samples` JSONB
- Sets `dataset.sample_count`
- Publishes `dataset.progress` WS event

#### Completion (`previewing → completed`, progress 90→100)

- Writes `lineage` JSONB with source metadata
- Sets `updated_at`
- Publishes `dataset.completed` WS event with fully hydrated dataset payload

#### Failure (any stage)

- Sets `status=failed`, `error_message`, `last_error_code`
- Publishes `dataset.failed` WS event
- No credit accounting needed

### Connector upgrades: `backend/api/src/dataset_connectors.py`

Both `inspect_huggingface_dataset()` and `inspect_kaggle_dataset()` upgraded to return sample rows:

```python
@dataclass
class ConnectorResult:
    columns: list[dict]          # [{name, dtype, nullable}]
    row_count: int
    media_types: list[str]
    sample_rows: list[dict]      # up to 50 rows
```

HuggingFace: uses `datasets` library or HF Inference API to fetch first 50 rows.
Kaggle: downloads smallest CSV file, reads first 50 rows with pandas, deletes temp file.
Local: stub returns empty `ConnectorResult` — "coming soon" placeholder.

### WS event envelope (canonical, same shape as Sprint 2)

```json
{
  "type": "dataset.progress" | "dataset.completed" | "dataset.failed",
  "datasetId": "...",
  "workspaceId": "...",
  "ts": 1234567890000,
  "payload": {
    "status": "analyzing",
    "progress": 60,
    "dataset": { ... }
  }
}
```

`dataset` object included in `dataset.completed` payload only. No refetch needed on completion.

### Updated `POST /api/datasets/import`

Replaces current sync implementation:

```
Body: { source, source_ref, name?, workspace_id? }
→ Validates source ∈ {huggingface, kaggle, local}
→ Creates Dataset (status=queued, progress=0)
→ Commits
→ asyncio.create_task(_run_ingestion_background(dataset_id, workspace_id))
→ Returns: { dataset_id: str, status: "queued" }
```

Background task uses fresh `SessionLocal` session — same pattern as Sprint 2 video/audio async endpoints.

### New endpoints

```
GET  /api/datasets/:id
     → Returns single dataset with full quality_report + preview_samples
     → 403 if workspace_id doesn't match user's workspace
     → 404 if deleted_at is set

DELETE /api/datasets/:id
     → Soft-delete (sets deleted_at)
     → 403 if not owner

GET  /api/datasets/:id/preview
     → Query params: offset=0, limit=10
     → Returns paginated slice of preview_samples JSONB array
     → Response: { rows: list[dict], total: int, offset: int, limit: int }
```

Existing `GET /api/datasets` kept — add `deleted_at IS NULL` filter.

### Background task lifecycle safety

Follows Sprint 2 pattern:
- Module-level `_background_tasks: set[asyncio.Task]` with `add_done_callback` to prevent GC
- `_log.exception()` on unhandled errors
- Failed tasks set `dataset.status = failed` before exiting

---

## Frontend Architecture

### New route

```
frontend/app/src/app/workspace/datasets/page.tsx
```

Renders `WorkspaceShell` wrapping the upgraded `DatasetConsole`.

### Updated shared types: `packages/types/src/index.ts`

New additions:

```typescript
export type DatasetStatus =
  | 'queued'
  | 'inspecting'
  | 'analyzing'
  | 'previewing'
  | 'completed'
  | 'failed'

export interface DatasetColumn {
  name: string
  dtype: string
  nullable: boolean
}

export interface DatasetQualityReport {
  null_rates: Record<string, number>
  duplicate_estimate: number
  media_types_detected: string[]
  language: string
  language_confidence: number
  row_count_verified: number
  sample_count: number
}

export interface Dataset {
  id: string
  workspaceId: string
  source: 'huggingface' | 'kaggle' | 'local'
  sourceRef: string
  name: string
  status: DatasetStatus
  progress: number
  rowCount: number
  sampleCount: number
  mediaTypes: string[]
  columns: DatasetColumn[]
  qualityReport: DatasetQualityReport | null
  previewSamples: Record<string, unknown>[]
  lineage: Record<string, unknown>
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}
```

WS events added to `WSMessage` union:

```typescript
| {
    type: 'dataset.progress'
    datasetId: string
    workspaceId: string
    ts: number
    payload: { status: DatasetStatus; progress: number }
  }
| {
    type: 'dataset.completed'
    datasetId: string
    workspaceId: string
    ts: number
    payload: { dataset: Dataset }
  }
| {
    type: 'dataset.failed'
    datasetId: string
    workspaceId: string
    ts: number
    payload: { error: string; errorCode: string | null }
  }
```

### New API client: `frontend/app/src/lib/api/datasets.ts`

```typescript
postDatasetImport(req): Promise<{ dataset_id: string; status: string }>
getDatasets(workspaceId): Promise<{ datasets: Dataset[] }>
getDataset(id): Promise<Dataset>
getDatasetPreview(id, offset, limit): Promise<{ rows: Record<string,unknown>[]; total: number }>
deleteDataset(id): Promise<void>
```

### Updated `QK` (query-keys.ts)

```typescript
datasets: (workspaceId) => ['datasets', workspaceId]
dataset: (id) => ['dataset', id]
datasetPreview: (id) => ['dataset-preview', id]
```

### New Zustand store: `frontend/app/src/lib/store/dataset.ts`

```typescript
interface ActiveIngestionState {
  datasetId: string
  sourceRef: string
  status: DatasetStatus
  progress: number
  errorMessage: string | null
  createdAt: number
}

interface DatasetStore {
  activeIngestions: Record<string, ActiveIngestionState>
  setIngesting(state: ActiveIngestionState): void
  updateProgress(id, status, progress): void
  completeIngestion(id, dataset): void
  failIngestion(id, error): void
  hydrateFromServer(datasets): void
}
```

### New hook: `useDatasetReconcile(workspaceId, lastEvent)`

Same pattern as `useGenerationReconcile`:
- On mount: `GET /api/datasets?status=queued,inspecting,analyzing,previewing` → `store.hydrateFromServer`
- WS `dataset.progress` → `store.updateProgress`
- WS `dataset.completed` → `store.completeIngestion` + `queryClient.setQueryData` prepend + `toast.success`
- WS `dataset.failed` → `store.failIngestion` + `toast.error`

### Upgraded `DatasetConsole` component

**Import form** (already exists — wire to real API):
- On submit: `postDatasetImport` → `store.setIngesting` → optimistic "queued" card appears immediately
- Local upload tab: show polished "coming in next sprint" placeholder (same pattern as TextComingSoon in Sprint 2)

**Dataset cards** (already exist — add live state):
- Stage label + animated progress bar while ingesting (reads from store)
- Full quality report section on `status === 'completed'`: null rates table, duplicate %, language badge, media type pills
- Delete button: `deleteDataset(id)` → optimistic removal via `queryClient.setQueryData`

**Preview drawer/section** (new):
- Triggered by "View preview" button on a completed dataset card
- Calls `getDatasetPreview(id, offset, limit)` via TanStack Query
- Renders paginated table of sample rows (offset pagination, limit 10 per page)
- Column headers from `dataset.columns`

**Status-aware card states:**

| Status | Card renders |
|---|---|
| `queued` | Animated pulse, "Queued…" |
| `inspecting` | Stage label, progress 20% |
| `analyzing` | Stage label, progress 60% |
| `previewing` | Stage label, progress 90% |
| `completed` | Quality report, preview button, delete |
| `failed` | Error message, retry button (creates new import) |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| HF dataset not found | `failed`, `last_error_code: 'source_not_found'` |
| Kaggle auth failure | `failed`, `last_error_code: 'auth_error'` |
| Network timeout during inspect | `failed`, `last_error_code: 'timeout'` |
| `langdetect` unavailable | Language detection skipped, `language: "unknown"` in quality_report |
| WS disconnect during ingestion | On reconnect: reconciliation fetch restores active ingestions in store |
| Delete while ingesting | Sets `deleted_at` immediately; background task checks `deleted_at` before each stage and exits cleanly |

---

## Testing Plan

**Backend:**
- Unit: `compute_quality_signals` — null rates, duplicate detection, language detection
- Unit: `run_ingestion` state transitions (mocked connector)
- Integration: `POST /api/datasets/import` returns 202 with dataset_id
- Integration: background task drives full lifecycle against mocked connectors
- Integration: WS event published on each stage transition
- Integration: `GET /api/datasets/:id/preview` returns paginated rows

**Frontend:**
- Unit: `useDatasetStore` — hydration, progress updates, completion
- Integration: import form → optimistic card → completion via mocked WS
- Integration: dataset card renders all 6 states correctly
- Integration: preview table renders paginated rows

---

## Out of Scope for Sprint 3

- Local file upload (placeholder UI only)
- Full dataset download / offline storage
- Dataset versioning
- Schema override UI
- Deduplication beyond sample-based estimate
- Caption coverage analysis
- Class balance statistics
- Project-scoped dataset assignment (column exists in Dataset model, UI not wired)
- Public dataset sharing

---

## Implementation Order

Following Approach A — pipeline first, UI derived:

1. **Neon DB migration** — add `progress`, `error_message`, `last_error_code`, `ingestion_config`, `sample_count`, `deleted_at` to `datasets`
2. **Backend model + schema updates** — add new fields to `Dataset` SQLAlchemy model and `DatasetResponse` Pydantic schema
3. **Connector upgrades** — upgrade `inspect_huggingface_dataset` and `inspect_kaggle_dataset` to return `ConnectorResult` with sample rows
4. **`compute_quality_signals`** — pure function, unit-testable in isolation
5. **`DatasetIngestionService`** — `run_ingestion` state machine + WS publish
6. **Router upgrades** — async `POST /import`, new `GET /:id`, `DELETE /:id`, `GET /:id/preview`
7. **Backend tests**
8. **Shared types update** — `Dataset`, `DatasetStatus`, `DatasetQualityReport`, WS events
9. **Frontend API client + QK update**
10. **`useDatasetStore`**
11. **`useDatasetReconcile` hook**
12. **`DatasetConsole` upgrades** — live ingestion cards, quality report, preview table
13. **`/workspace/datasets` page**
14. **Frontend build check + integration test**
