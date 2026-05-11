# Sprint 2: Generation Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full generation pipeline (image/video/audio) with a cinematic side-by-side studio UI, stage-aware lifecycle, hybrid sync/async persistence, and a realtime flat gallery feed.

**Architecture:** Backend replaces the stub `Generation` model with `GenerationJob` + `Asset` tables, a `GenerationService` state machine, and mode-split HTTP endpoints (image sync, video/audio async) that publish WS events on every status transition. Frontend adds a Zustand `useGenerationStore` for ephemeral job state, uses TanStack Query for the persistent gallery feed, and wires WS events as the synchronization transport between the two.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Pydantic v2, huggingface_hub InferenceClient, Redis pub/sub (existing), Next.js 15, React 19, Zustand, TanStack Query v5, Framer Motion, @tanstack/react-virtual, Radix UI

---

## File Map

**Backend — new/modified**
- `backend/api/src/models.py` — replace `Generation`/`Asset` with `GenerationJob`, `Asset`, `GenerationJobInput`; add `credits_reserved` to `User`
- `backend/api/src/schemas.py` — add `GenerationJobResponse`, `AssetResponse`, `ImageGenerateRequest`, `AsyncGenerateRequest`, `JobsPageResponse`, `FavoriteResponse`
- `backend/api/src/services/__init__.py` — new package init
- `backend/api/src/services/generation.py` — `GenerationService`: state machine, credit reserve/finalize/release, WS publish
- `backend/api/src/services/inference.py` — `InferenceProvider` Protocol + `HuggingFaceProvider` (image sync, video/audio async polling)
- `backend/api/src/routers/generations.py` — replace stub with image/video/audio/gallery/cancel/favorite endpoints
- `backend/api/src/main.py` — no change needed (already mounts `generations` router)
- `backend/api/tests/test_generation_service.py` — unit tests: state machine, credits, idempotency
- `backend/api/tests/test_generation_api.py` — integration tests: endpoints, pagination, WS events

**Frontend — new/modified**
- `packages/types/src/index.ts` — update `GenerationStatus`, add `GenerationJob`, `Asset`, new WS event shapes
- `frontend/app/src/lib/api/generation.ts` — `postImageGeneration`, `postVideoGeneration`, `postAudioGeneration`, `getGenerationJobs`, `getGenerationJob`, `deleteGenerationJob`, `patchFavorite`
- `frontend/app/src/lib/api/query-keys.ts` — add `generationJob(id)`, `generationJobsInflight(workspaceId)`
- `frontend/app/src/lib/store/generation.ts` — `useGenerationStore`: `activeJobs`, `focusedJobId`, all actions
- `frontend/app/src/lib/hooks/use-generation-reconcile.ts` — fetch in-flight jobs on mount, hydrate store
- `frontend/app/src/components/generate/controls-panel.tsx` — mode tabs, prompt, negative prompt, seed, Generate button
- `frontend/app/src/components/generate/output-panel.tsx` — dispatcher by mode + job state
- `frontend/app/src/components/generate/outputs/image-output.tsx` — shimmer → fade-in image
- `frontend/app/src/components/generate/outputs/video-output.tsx` — stage labels → HTML5 player
- `frontend/app/src/components/generate/outputs/audio-output.tsx` — waveform → audio player
- `frontend/app/src/components/generate/outputs/text-coming-soon.tsx` — polished placeholder
- `frontend/app/src/components/generate/generation-card.tsx` — unified card, all 8 states
- `frontend/app/src/components/generate/generation-history.tsx` — virtualized infinite scroll grid
- `frontend/app/src/app/workspace/generate/page.tsx` — assembles studio layout

---

## Task 1: Update shared types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Replace generation types**

Open `packages/types/src/index.ts` and replace the file with:

```typescript
export type GenerationMode = 'text' | 'image' | 'video' | 'audio'

export type GenerationStatus =
  | 'queued'
  | 'preprocessing'
  | 'running'
  | 'postprocessing'
  | 'persisting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  creditsRemaining: number
  creditsReserved: number
  createdAt: string
}

export interface GenerationJob {
  id: string
  userId: string
  workspaceId: string
  projectId: string | null
  mode: GenerationMode
  prompt: string
  negativePrompt: string | null
  model: string
  provider: string
  seed: number | null
  status: GenerationStatus
  progress: number
  errorMessage: string | null
  lastErrorCode: string | null
  retryCount: number
  cancelRequested: boolean
  creditsCosted: number | null
  idempotencyKey: string | null
  inputAssetIds: string[] | null
  metadata: Record<string, unknown>
  visibility: 'private' | 'unlisted' | 'public'
  previewStorageKey: string | null
  sourceGenerationJobId: string | null
  queueWaitMs: number | null
  inferenceDurationMs: number | null
  persistDurationMs: number | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assets: Asset[]
}

export interface Asset {
  id: string
  generationJobId: string
  userId: string
  workspaceId: string
  generationIndex: number
  type: 'image' | 'video' | 'audio'
  storageKey: string
  mimeType: string
  fileSizeBytes: number | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  metadata: Record<string, unknown>
  isFavorite: boolean
  visibility: 'private' | 'unlisted' | 'public'
  status: 'pending' | 'ready' | 'failed'
  createdAt: string
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'error'
  createdAt: string
  read: boolean
}

export interface AuthResponse {
  accessToken: string
  user: User
}

export interface Workspace {
  id: string
  name: string
  plan: 'studio' | 'pro' | 'enterprise'
  createdAt: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string | null
  mode: 'multimodal' | 'text' | 'image' | 'video'
  createdAt: string
}

export interface WorkspaceDetail extends Workspace {
  projects: Project[]
}

export interface UserWithWorkspace extends User {
  workspaceId: string
}

// Server → Client WebSocket events
export type WSMessage =
  | { type: 'connected'; workspaceId: string; userId: string; ts: number }
  | { type: 'error'; code: string; message: string; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'workspace.presence'; userIds: string[]; ts: number }
  | {
      type: 'generation.progress'
      jobId: string
      workspaceId: string
      ts: number
      payload: { status: GenerationStatus; progress: number }
    }
  | {
      type: 'generation.completed'
      jobId: string
      workspaceId: string
      ts: number
      payload: { job: GenerationJob; assets: Asset[] }
    }
  | {
      type: 'generation.failed'
      jobId: string
      workspaceId: string
      ts: number
      payload: { error: string; errorCode: string | null }
    }
  | { type: 'training.progress'; jobId: string; progress: number; workerStatus: string; ts: number }
  | { type: 'training.completed'; jobId: string; artifactPaths: Record<string, string>; ts: number }
  | { type: 'notification'; id: string; title: string; body: string; kind: string; ts: number }

// Client → Server WebSocket messages
export type WSClientMessage =
  | { type: 'ping'; ts: number }
```

- [ ] **Step 2: Build types package**

```bash
cd packages/types && pnpm build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): Sprint 2 — GenerationJob, Asset, updated WS event shapes"
```

---

## Task 2: Backend models — replace Generation/Asset with Sprint 2 schema

**Files:**
- Modify: `backend/api/src/models.py`

- [ ] **Step 1: Replace Generation and Asset models**

Open `backend/api/src/models.py`. Replace the `Generation` and `Asset` classes (lines 43–69) with the new models. Keep all other models unchanged. The full new block:

```python
class GenerationJob(Base):
    __tablename__ = 'generation_jobs'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(20), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(50), default='huggingface')
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default='queued', index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    credits_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    input_asset_ids: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    visibility: Mapped[str] = mapped_column(String(20), default='private')
    preview_storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_generation_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    queue_wait_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    inference_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    persist_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assets: Mapped[list['Asset']] = relationship('Asset', back_populates='job', lazy='selectin')


class Asset(Base):
    __tablename__ = 'assets'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    generation_job_id: Mapped[str] = mapped_column(ForeignKey('generation_jobs.id'), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    generation_index: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20))
    storage_key: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(50))
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    visibility: Mapped[str] = mapped_column(String(20), default='private')
    status: Mapped[str] = mapped_column(String(20), default='pending')
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job: Mapped['GenerationJob'] = relationship('GenerationJob', back_populates='assets')


class GenerationJobInput(Base):
    __tablename__ = 'generation_job_inputs'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    generation_job_id: Mapped[str] = mapped_column(ForeignKey('generation_jobs.id'), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey('assets.id'), index=True)
    role: Mapped[str] = mapped_column(String(50))
```

Also add `credits_reserved` to the `User` model after `credits_remaining`:

```python
credits_reserved: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/src/models.py
git commit -m "feat(models): GenerationJob, Asset, GenerationJobInput — Sprint 2 schema"
```

---

## Task 3: Neon DB migrations

**Files:** (SQL via Neon MCP or psql — no file to modify)

- [ ] **Step 1: Create generation_jobs table**

Run via Neon MCP `run_sql` (one statement per call):

```sql
CREATE TABLE generation_jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
  project_id VARCHAR(36),
  mode VARCHAR(20) NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'huggingface',
  seed BIGINT,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  last_error_code VARCHAR(100),
  retry_count INTEGER NOT NULL DEFAULT 0,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  credits_cost INTEGER,
  idempotency_key VARCHAR(64) UNIQUE,
  input_asset_ids JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  preview_storage_key TEXT,
  source_generation_job_id VARCHAR(36),
  queue_wait_ms INTEGER,
  inference_duration_ms INTEGER,
  persist_duration_ms INTEGER,
  deleted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
)
```

- [ ] **Step 2: Create assets table**

```sql
CREATE TABLE assets (
  id VARCHAR(36) PRIMARY KEY,
  generation_job_id VARCHAR(36) NOT NULL REFERENCES generation_jobs(id),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
  generation_index INTEGER NOT NULL DEFAULT 0,
  type VARCHAR(20) NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  file_size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  duration_seconds FLOAT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
)
```

- [ ] **Step 3: Create generation_job_inputs table**

```sql
CREATE TABLE generation_job_inputs (
  id VARCHAR(36) PRIMARY KEY,
  generation_job_id VARCHAR(36) NOT NULL REFERENCES generation_jobs(id),
  asset_id VARCHAR(36) NOT NULL REFERENCES assets(id),
  role VARCHAR(50) NOT NULL
)
```

- [ ] **Step 4: Add credits_reserved to users**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reserved INTEGER NOT NULL DEFAULT 0
```

- [ ] **Step 5: Create indexes**

```sql
CREATE INDEX idx_generation_jobs_workspace_status ON generation_jobs(workspace_id, status)
```

```sql
CREATE INDEX idx_generation_jobs_workspace_created ON generation_jobs(workspace_id, created_at DESC)
```

```sql
CREATE INDEX idx_assets_job ON assets(generation_job_id)
```

- [ ] **Step 6: Commit note**

```bash
git commit --allow-empty -m "chore: Neon DB migration — generation_jobs, assets, generation_job_inputs tables"
```

---

## Task 4: Backend schemas

**Files:**
- Modify: `backend/api/src/schemas.py`

- [ ] **Step 1: Add generation schemas**

Add to the end of `backend/api/src/schemas.py`:

```python
class AssetOut(OrmModel):
    id: str
    generation_job_id: str
    user_id: str
    workspace_id: str
    generation_index: int
    type: str
    storage_key: str
    mime_type: str
    file_size_bytes: int | None
    width: int | None
    height: int | None
    duration_seconds: float | None
    metadata_json: dict
    is_favorite: bool
    visibility: str
    status: str
    created_at: datetime


class GenerationJobOut(OrmModel):
    id: str
    user_id: str
    workspace_id: str
    project_id: str | None
    mode: str
    prompt: str
    negative_prompt: str | None
    model: str
    provider: str
    seed: int | None
    status: str
    progress: int
    error_message: str | None
    last_error_code: str | None
    retry_count: int
    cancel_requested: bool
    credits_cost: int | None
    idempotency_key: str | None
    metadata_json: dict
    visibility: str
    preview_storage_key: str | None
    source_generation_job_id: str | None
    queue_wait_ms: int | None
    inference_duration_ms: int | None
    persist_duration_ms: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    assets: list[AssetOut] = []


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    negative_prompt: str | None = Field(default=None, max_length=1000)
    model: str = 'black-forest-labs/FLUX.1-schnell'
    seed: int | None = None
    metadata: dict = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=64)


class AsyncGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    negative_prompt: str | None = Field(default=None, max_length=1000)
    model: str | None = None
    seed: int | None = None
    metadata: dict = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=64)


class AsyncGenerateResponse(BaseModel):
    job_id: str
    status: str = 'queued'


class ImageGenerateResponse(BaseModel):
    job: GenerationJobOut
    asset: AssetOut


class JobsPageResponse(BaseModel):
    jobs: list[GenerationJobOut]
    next_cursor: str | None


class FavoriteResponse(BaseModel):
    is_favorite: bool
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/src/schemas.py
git commit -m "feat(schemas): GenerationJobOut, AssetOut, generation request/response schemas"
```

---

## Task 5: InferenceProvider + HuggingFaceProvider

**Files:**
- Create: `backend/api/src/services/__init__.py`
- Create: `backend/api/src/services/inference.py`

- [ ] **Step 1: Create services package**

Create `backend/api/src/services/__init__.py` (empty):

```python
```

- [ ] **Step 2: Create inference.py**

Create `backend/api/src/services/inference.py`:

```python
import base64
import time
from dataclasses import dataclass
from typing import AsyncIterator, Protocol

from ..config import get_settings
from ..models import GenerationJob

settings = get_settings()

CREDIT_COSTS: dict[str, int] = {'image': 10, 'video': 50, 'audio': 20, 'text': 5}
DEFAULT_MODELS: dict[str, str] = {
    'image': 'black-forest-labs/FLUX.1-schnell',
    'video': 'Wan-AI/Wan2.1-T2V-1.3B',
    'audio': 'facebook/musicgen-small',
}


@dataclass
class ProviderUpdate:
    status: str          # preprocessing | running | postprocessing | persisting | completed | failed
    progress: int        # 0-100
    storage_key: str | None = None   # set when completed
    mime_type: str | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    error_message: str | None = None
    error_code: str | None = None
    inference_duration_ms: int | None = None


class InferenceProvider(Protocol):
    async def generate(self, job: GenerationJob) -> AsyncIterator[ProviderUpdate]: ...


class HuggingFaceProvider:
    """Wraps HF InferenceClient. All HF-specific semantics stay inside this class."""

    async def generate(self, job: GenerationJob) -> AsyncIterator[ProviderUpdate]:
        from huggingface_hub import InferenceClient

        token = settings.huggingface_token
        client = InferenceClient(token=token)
        model = job.model or DEFAULT_MODELS.get(job.mode, '')

        yield ProviderUpdate(status='preprocessing', progress=10)

        inference_start = time.time()

        if job.mode == 'image':
            yield ProviderUpdate(status='running', progress=30)
            try:
                image = client.text_to_image(
                    job.prompt,
                    model=model,
                    negative_prompt=job.negative_prompt,
                )
            except Exception as exc:
                yield ProviderUpdate(
                    status='failed', progress=0,
                    error_message=str(exc), error_code='hf_inference_error',
                )
                return

            inference_ms = int((time.time() - inference_start) * 1000)

            # Encode to base64 data URL (Sprint 2 dev — no object storage yet)
            import io
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            b64 = base64.b64encode(buf.getvalue()).decode()
            storage_key = f'data:image/png;base64,{b64}'

            yield ProviderUpdate(
                status='completed', progress=100,
                storage_key=storage_key,
                mime_type='image/png',
                width=image.width,
                height=image.height,
                inference_duration_ms=inference_ms,
            )

        elif job.mode == 'audio':
            yield ProviderUpdate(status='running', progress=30)
            try:
                audio_bytes = client.text_to_speech(job.prompt, model=model)
            except Exception as exc:
                yield ProviderUpdate(
                    status='failed', progress=0,
                    error_message=str(exc), error_code='hf_inference_error',
                )
                return

            inference_ms = int((time.time() - inference_start) * 1000)
            b64 = base64.b64encode(audio_bytes).decode()
            storage_key = f'data:audio/wav;base64,{b64}'

            yield ProviderUpdate(
                status='completed', progress=100,
                storage_key=storage_key,
                mime_type='audio/wav',
                inference_duration_ms=inference_ms,
            )

        elif job.mode == 'video':
            yield ProviderUpdate(status='running', progress=20)
            # HF video generation is long-running — simulate progress ticks
            # Real implementation would poll HF async task
            try:
                import asyncio
                for tick_progress in range(25, 80, 10):
                    await asyncio.sleep(5)
                    if job.cancel_requested:
                        yield ProviderUpdate(status='cancelled', progress=tick_progress)
                        return
                    yield ProviderUpdate(status='running', progress=tick_progress)

                video_bytes = client.text_to_video(job.prompt, model=model)
            except Exception as exc:
                yield ProviderUpdate(
                    status='failed', progress=0,
                    error_message=str(exc), error_code='hf_inference_error',
                )
                return

            inference_ms = int((time.time() - inference_start) * 1000)
            b64 = base64.b64encode(video_bytes).decode()
            storage_key = f'data:video/mp4;base64,{b64}'

            yield ProviderUpdate(
                status='completed', progress=100,
                storage_key=storage_key,
                mime_type='video/mp4',
                inference_duration_ms=inference_ms,
            )

        else:
            yield ProviderUpdate(
                status='failed', progress=0,
                error_message=f'Mode {job.mode!r} not supported',
                error_code='unsupported_mode',
            )
```

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/services/__init__.py backend/api/src/services/inference.py
git commit -m "feat(services): InferenceProvider protocol + HuggingFaceProvider (image/video/audio)"
```

---

## Task 6: GenerationService — state machine + WS publish

**Files:**
- Create: `backend/api/src/services/generation.py`

- [ ] **Step 1: Create generation service**

Create `backend/api/src/services/generation.py`:

```python
import json
import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import GenerationJob, Asset, User
from ..schemas import GenerationJobOut, AssetOut
from .inference import HuggingFaceProvider, CREDIT_COSTS, DEFAULT_MODELS, ProviderUpdate

_provider = HuggingFaceProvider()

PROGRESS_FOR_STATUS: dict[str, int] = {
    'queued': 0,
    'preprocessing': 10,
    'running': 30,
    'postprocessing': 90,
    'persisting': 95,
    'completed': 100,
    'failed': 0,
    'cancelled': 0,
}


async def _publish(redis, workspace_id: str, event: dict) -> None:
    await redis.publish(f'ws:workspace:{workspace_id}', json.dumps(event))


async def _transition(
    db: AsyncSession,
    redis,
    job: GenerationJob,
    status: str,
    progress: int,
    *,
    error_message: str | None = None,
    error_code: str | None = None,
) -> None:
    job.status = status
    job.progress = progress
    job.updated_at = datetime.utcnow()
    if error_message:
        job.error_message = error_message
    if error_code:
        job.last_error_code = error_code
    if status == 'running' and job.started_at is None:
        job.started_at = datetime.utcnow()
    await db.flush()
    await _publish(redis, job.workspace_id, {
        'type': 'generation.progress',
        'jobId': job.id,
        'workspaceId': job.workspace_id,
        'ts': int(time.time() * 1000),
        'payload': {'status': status, 'progress': progress},
    })


async def create_job(
    db: AsyncSession,
    user: User,
    workspace_id: str,
    mode: str,
    prompt: str,
    *,
    negative_prompt: str | None = None,
    model: str | None = None,
    seed: int | None = None,
    metadata: dict | None = None,
    idempotency_key: str | None = None,
) -> GenerationJob:
    """Create a job and reserve credits. Raises ValueError if insufficient credits."""
    # Idempotency check
    if idempotency_key:
        existing = await db.scalar(
            select(GenerationJob).where(GenerationJob.idempotency_key == idempotency_key)
        )
        if existing:
            return existing

    cost = CREDIT_COSTS.get(mode, 10)
    available = user.credits_remaining - user.credits_reserved
    if available < cost:
        raise ValueError('insufficient_credits')

    user.credits_reserved += cost

    job = GenerationJob(
        id=str(uuid4()),
        user_id=user.id,
        workspace_id=workspace_id,
        mode=mode,
        prompt=prompt,
        negative_prompt=negative_prompt,
        model=model or DEFAULT_MODELS.get(mode, ''),
        provider='huggingface',
        seed=seed,
        metadata_json=metadata or {},
        idempotency_key=idempotency_key,
        credits_cost=cost,
        status='queued',
        progress=0,
    )
    db.add(job)
    await db.flush()
    return job


async def run_job(
    db: AsyncSession,
    redis,
    job: GenerationJob,
    user: User,
) -> Asset | None:
    """Drive job through full lifecycle. Returns Asset on success, None on failure/cancel."""
    queue_start = time.time()

    try:
        async for update in _provider.generate(job):
            if job.cancel_requested and update.status not in ('completed', 'failed', 'cancelled'):
                await _transition(db, redis, job, 'cancelled', job.progress)
                user.credits_reserved -= (job.credits_cost or 0)
                await db.commit()
                return None

            if update.status == 'failed':
                await _transition(
                    db, redis, job, 'failed', job.progress,
                    error_message=update.error_message,
                    error_code=update.error_code,
                )
                user.credits_reserved -= (job.credits_cost or 0)
                await db.commit()
                await _publish(redis, job.workspace_id, {
                    'type': 'generation.failed',
                    'jobId': job.id,
                    'workspaceId': job.workspace_id,
                    'ts': int(time.time() * 1000),
                    'payload': {'error': update.error_message or 'Unknown error', 'errorCode': update.error_code},
                })
                return None

            if update.status == 'cancelled':
                await _transition(db, redis, job, 'cancelled', job.progress)
                user.credits_reserved -= (job.credits_cost or 0)
                await db.commit()
                return None

            if update.status == 'completed':
                # Set timing metrics
                if update.inference_duration_ms:
                    job.inference_duration_ms = update.inference_duration_ms
                job.queue_wait_ms = int((time.time() - queue_start) * 1000)

                # Persist → transition
                persist_start = time.time()
                await _transition(db, redis, job, 'persisting', 95)

                asset = Asset(
                    id=str(uuid4()),
                    generation_job_id=job.id,
                    user_id=job.user_id,
                    workspace_id=job.workspace_id,
                    generation_index=0,
                    type=job.mode,
                    storage_key=update.storage_key or '',
                    mime_type=update.mime_type or 'application/octet-stream',
                    width=update.width,
                    height=update.height,
                    duration_seconds=update.duration_seconds,
                    status='ready',
                )
                db.add(asset)

                job.persist_duration_ms = int((time.time() - persist_start) * 1000)
                job.completed_at = datetime.utcnow()

                # Finalize credits
                user.credits_reserved -= (job.credits_cost or 0)
                user.credits_remaining -= (job.credits_cost or 0)

                await _transition(db, redis, job, 'completed', 100)
                await db.flush()

                job_out = GenerationJobOut.model_validate(job)
                asset_out = AssetOut.model_validate(asset)

                await db.commit()

                await _publish(redis, job.workspace_id, {
                    'type': 'generation.completed',
                    'jobId': job.id,
                    'workspaceId': job.workspace_id,
                    'ts': int(time.time() * 1000),
                    'payload': {
                        'job': job_out.model_dump(mode='json'),
                        'assets': [asset_out.model_dump(mode='json')],
                    },
                })
                return asset

            # Intermediate progress update
            await _transition(db, redis, job, update.status, update.progress)

    except Exception as exc:
        await _transition(
            db, redis, job, 'failed', job.progress,
            error_message=str(exc), error_code='internal_error',
        )
        user.credits_reserved -= (job.credits_cost or 0)
        await db.commit()
        raise

    return None
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/src/services/generation.py
git commit -m "feat(services): GenerationService — state machine, credit reserve/finalize, WS publish"
```

---

## Task 7: Generation router

**Files:**
- Modify: `backend/api/src/routers/generations.py`

- [ ] **Step 1: Replace generations router**

Replace the full contents of `backend/api/src/routers/generations.py`:

```python
import asyncio
import time
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Asset, GenerationJob, User, Workspace
from ..realtime import _get_redis
from ..schemas import (
    AsyncGenerateRequest, AsyncGenerateResponse,
    FavoriteResponse, GenerationJobOut, ImageGenerateRequest,
    ImageGenerateResponse, JobsPageResponse,
)
from ..security import audit, get_current_user
from ..services.generation import create_job, run_job

router = APIRouter()

INFLIGHT = {'queued', 'preprocessing', 'running', 'postprocessing', 'persisting'}


def _assert_workspace_access(job: GenerationJob, user: User) -> None:
    if job.user_id != user.id:
        raise HTTPException(status_code=403, detail='Forbidden')


async def _get_workspace_id(db: AsyncSession, user: User) -> str:
    ws = await db.scalar(select(Workspace).where(Workspace.owner_id == user.id))
    if not ws:
        raise HTTPException(status_code=404, detail='Workspace not found')
    return ws.id


@router.post('/image', response_model=ImageGenerateResponse, status_code=200)
async def generate_image(
    payload: ImageGenerateRequest,
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImageGenerateResponse:
    workspace_id = await _get_workspace_id(db, user)
    ik = payload.idempotency_key or idempotency_key

    try:
        job = await create_job(
            db, user, workspace_id, 'image', payload.prompt,
            negative_prompt=payload.negative_prompt,
            model=payload.model,
            seed=payload.seed,
            metadata=payload.metadata,
            idempotency_key=ik,
        )
    except ValueError as exc:
        if 'insufficient' in str(exc):
            raise HTTPException(status_code=402, detail='Insufficient credits')
        raise

    # Check idempotency — job already completed
    if job.status == 'completed' and job.assets:
        return ImageGenerateResponse(
            job=GenerationJobOut.model_validate(job),
            asset=job.assets[0],  # type: ignore[arg-type]
        )

    redis = await _get_redis()
    try:
        asset = await run_job(db, redis, job, user)
    finally:
        await redis.aclose()

    if not asset:
        raise HTTPException(status_code=502, detail=job.error_message or 'Generation failed')

    await audit(db, user.id, 'generation.image', 'generation_job', job.id, {'mode': 'image'})
    await db.commit()

    return ImageGenerateResponse(
        job=GenerationJobOut.model_validate(job),
        asset=asset,  # type: ignore[arg-type]
    )


@router.post('/video', response_model=AsyncGenerateResponse, status_code=202)
async def generate_video(
    payload: AsyncGenerateRequest,
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AsyncGenerateResponse:
    workspace_id = await _get_workspace_id(db, user)
    ik = payload.idempotency_key or idempotency_key

    try:
        job = await create_job(
            db, user, workspace_id, 'video', payload.prompt,
            negative_prompt=payload.negative_prompt,
            model=payload.model or 'Wan-AI/Wan2.1-T2V-1.3B',
            seed=payload.seed,
            metadata=payload.metadata,
            idempotency_key=ik,
        )
    except ValueError:
        raise HTTPException(status_code=402, detail='Insufficient credits')

    await db.commit()

    async def _bg():
        from ..db import SessionLocal
        async with SessionLocal() as bg_db:
            bg_user = await bg_db.get(User, user.id)
            bg_job = await bg_db.get(GenerationJob, job.id)
            redis = await _get_redis()
            try:
                await run_job(bg_db, redis, bg_job, bg_user)
            finally:
                await redis.aclose()

    asyncio.create_task(_bg())
    return AsyncGenerateResponse(job_id=job.id, status='queued')


@router.post('/audio', response_model=AsyncGenerateResponse, status_code=202)
async def generate_audio(
    payload: AsyncGenerateRequest,
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AsyncGenerateResponse:
    workspace_id = await _get_workspace_id(db, user)
    ik = payload.idempotency_key or idempotency_key

    try:
        job = await create_job(
            db, user, workspace_id, 'audio', payload.prompt,
            negative_prompt=payload.negative_prompt,
            model=payload.model or 'facebook/musicgen-small',
            seed=payload.seed,
            metadata=payload.metadata,
            idempotency_key=ik,
        )
    except ValueError:
        raise HTTPException(status_code=402, detail='Insufficient credits')

    await db.commit()

    async def _bg():
        from ..db import SessionLocal
        async with SessionLocal() as bg_db:
            bg_user = await bg_db.get(User, user.id)
            bg_job = await bg_db.get(GenerationJob, job.id)
            redis = await _get_redis()
            try:
                await run_job(bg_db, redis, bg_job, bg_user)
            finally:
                await redis.aclose()

    asyncio.create_task(_bg())
    return AsyncGenerateResponse(job_id=job.id, status='queued')


@router.get('/jobs', response_model=JobsPageResponse)
async def list_jobs(
    workspace_id: str = Query(...),
    mode: str | None = Query(default=None),
    status: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JobsPageResponse:
    # Verify workspace ownership
    ws = await db.get(Workspace, workspace_id)
    if not ws or ws.owner_id != user.id:
        raise HTTPException(status_code=403, detail='Forbidden')

    stmt = (
        select(GenerationJob)
        .where(GenerationJob.workspace_id == workspace_id)
        .where(GenerationJob.deleted_at.is_(None))
        .order_by(GenerationJob.created_at.desc(), GenerationJob.id.desc())
        .limit(limit + 1)
    )
    if mode:
        stmt = stmt.where(GenerationJob.mode == mode)
    if status:
        statuses = [s.strip() for s in status.split(',')]
        stmt = stmt.where(GenerationJob.status.in_(statuses))
    if cursor:
        # cursor = "created_at_iso|id"
        parts = cursor.split('|', 1)
        if len(parts) == 2:
            from datetime import datetime as dt
            try:
                cur_ts = dt.fromisoformat(parts[0])
                cur_id = parts[1]
                stmt = stmt.where(
                    (GenerationJob.created_at < cur_ts) |
                    ((GenerationJob.created_at == cur_ts) & (GenerationJob.id < cur_id))
                )
            except ValueError:
                pass

    rows = (await db.scalars(stmt)).all()
    has_more = len(rows) > limit
    jobs = rows[:limit]

    next_cursor: str | None = None
    if has_more and jobs:
        last = jobs[-1]
        next_cursor = f'{last.created_at.isoformat()}|{last.id}'

    return JobsPageResponse(
        jobs=[GenerationJobOut.model_validate(j) for j in jobs],
        next_cursor=next_cursor,
    )


@router.get('/jobs/{job_id}', response_model=GenerationJobOut)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GenerationJobOut:
    job = await db.get(GenerationJob, job_id)
    if not job or job.deleted_at is not None:
        raise HTTPException(status_code=404, detail='Job not found')
    _assert_workspace_access(job, user)
    return GenerationJobOut.model_validate(job)


@router.delete('/jobs/{job_id}', status_code=204)
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    job = await db.get(GenerationJob, job_id)
    if not job or job.deleted_at is not None:
        raise HTTPException(status_code=404, detail='Job not found')
    _assert_workspace_access(job, user)

    if job.status in INFLIGHT:
        job.cancel_requested = True
    else:
        from datetime import datetime
        job.deleted_at = datetime.utcnow()
        for asset in job.assets:
            asset.deleted_at = datetime.utcnow()

    await db.commit()


@router.patch('/assets/{asset_id}/favorite', response_model=FavoriteResponse)
async def toggle_favorite(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FavoriteResponse:
    asset = await db.get(Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(status_code=404, detail='Asset not found')
    if asset.user_id != user.id:
        raise HTTPException(status_code=403, detail='Forbidden')
    asset.is_favorite = not asset.is_favorite
    await db.commit()
    return FavoriteResponse(is_favorite=asset.is_favorite)
```

- [ ] **Step 2: Update main.py prefix**

In `backend/api/src/main.py`, change the generations router prefix from `/api/generations` to `/api/generation`:

```python
app.include_router(generations.router, prefix='/api/generation', tags=['generation'])
```

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/routers/generations.py backend/api/src/main.py
git commit -m "feat(api): generation endpoints — image sync, video/audio async, gallery, cancel, favorite"
```

---

## Task 8: Backend tests

**Files:**
- Create: `backend/api/tests/test_generation_service.py`
- Create: `backend/api/tests/test_generation_api.py`

- [ ] **Step 1: Write service unit tests**

Create `backend/api/tests/test_generation_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from ..src.services.generation import create_job, CREDIT_COSTS
from ..src.models import GenerationJob, User


@pytest.fixture
def mock_user():
    u = MagicMock(spec=User)
    u.id = 'user-1'
    u.credits_remaining = 1000
    u.credits_reserved = 0
    return u


@pytest.mark.asyncio
async def test_create_job_reserves_credits(mock_user):
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.flush = AsyncMock()

    job = await create_job(db, mock_user, 'ws-1', 'image', 'a cat')

    assert mock_user.credits_reserved == CREDIT_COSTS['image']
    assert job.mode == 'image'
    assert job.status == 'queued'
    assert job.workspace_id == 'ws-1'


@pytest.mark.asyncio
async def test_create_job_raises_on_insufficient_credits(mock_user):
    mock_user.credits_remaining = 5
    mock_user.credits_reserved = 0
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(ValueError, match='insufficient_credits'):
        await create_job(db, mock_user, 'ws-1', 'image', 'a cat')


@pytest.mark.asyncio
async def test_create_job_idempotency_returns_existing(mock_user):
    existing = MagicMock(spec=GenerationJob)
    existing.id = 'existing-job'
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=existing)

    job = await create_job(db, mock_user, 'ws-1', 'image', 'a cat', idempotency_key='key-1')

    assert job.id == 'existing-job'
    assert mock_user.credits_reserved == 0  # not reserved again


@pytest.mark.asyncio
async def test_credit_costs_correct():
    assert CREDIT_COSTS['image'] == 10
    assert CREDIT_COSTS['video'] == 50
    assert CREDIT_COSTS['audio'] == 20
```

- [ ] **Step 2: Run service tests**

```bash
cd backend/api && python -m pytest tests/test_generation_service.py -v
```

Expected: 4 tests pass.

- [ ] **Step 3: Write API integration tests**

Create `backend/api/tests/test_generation_api.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from ..src.main import app
from ..src.models import GenerationJob, Asset, User
from ..src.services.generation import create_job


@pytest.fixture
def auth_headers():
    from ..src.security import create_access_token
    token = create_access_token('test-user-id')
    return {'Authorization': f'Bearer {token}'}


@pytest.mark.asyncio
async def test_generate_image_insufficient_credits(auth_headers):
    mock_user = MagicMock(spec=User)
    mock_user.id = 'test-user-id'
    mock_user.credits_remaining = 0
    mock_user.credits_reserved = 0

    with patch('backend.api.src.routers.generations.get_current_user', return_value=mock_user), \
         patch('backend.api.src.routers.generations._get_workspace_id', return_value='ws-1'), \
         patch('backend.api.src.services.generation.create_job', side_effect=ValueError('insufficient_credits')):
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.post(
                '/api/generation/image',
                json={'prompt': 'a cat'},
                headers=auth_headers,
            )
    assert resp.status_code == 402


@pytest.mark.asyncio
async def test_list_jobs_requires_workspace_ownership(auth_headers):
    with patch('backend.api.src.routers.generations.get_current_user') as mock_get_user:
        mock_user = MagicMock(spec=User)
        mock_user.id = 'test-user-id'
        mock_get_user.return_value = mock_user

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.get(
                '/api/generation/jobs?workspace_id=not-my-workspace',
                headers=auth_headers,
            )
    assert resp.status_code in (403, 404, 422)


@pytest.mark.asyncio
async def test_toggle_favorite_forbidden_for_other_user(auth_headers):
    mock_asset = MagicMock(spec=Asset)
    mock_asset.user_id = 'other-user'
    mock_asset.deleted_at = None

    with patch('backend.api.src.routers.generations.get_current_user') as mock_cu, \
         patch('backend.api.src.routers.generations.get_db') as mock_db:
        mock_user = MagicMock(spec=User)
        mock_user.id = 'test-user-id'
        mock_cu.return_value = mock_user

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=mock_asset)
        mock_db.return_value = mock_session

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.patch('/api/generation/assets/asset-1/favorite', headers=auth_headers)
    assert resp.status_code == 403
```

- [ ] **Step 4: Run API tests**

```bash
cd backend/api && python -m pytest tests/test_generation_api.py -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/api/tests/test_generation_service.py backend/api/tests/test_generation_api.py
git commit -m "test(generation): service unit tests + API integration tests"
```

---

## Task 9: Frontend — API client + query keys

**Files:**
- Create: `frontend/app/src/lib/api/generation.ts`
- Modify: `frontend/app/src/lib/api/query-keys.ts`

- [ ] **Step 1: Create generation API client**

Create `frontend/app/src/lib/api/generation.ts`:

```typescript
import type { GenerationJob, Asset } from '@aether/types'
import { apiRequest } from './client'

export interface ImageGenerateRequest {
  prompt: string
  negativePrompt?: string
  model?: string
  seed?: number
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface AsyncGenerateRequest {
  prompt: string
  negativePrompt?: string
  model?: string
  seed?: number
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface ImageGenerateResponse {
  job: GenerationJob
  asset: Asset
}

export interface AsyncGenerateResponse {
  job_id: string
  status: string
}

export interface JobsPage {
  jobs: GenerationJob[]
  next_cursor: string | null
}

function toSnake(req: ImageGenerateRequest | AsyncGenerateRequest) {
  return {
    prompt: req.prompt,
    negative_prompt: req.negativePrompt ?? null,
    model: (req as ImageGenerateRequest).model,
    seed: req.seed ?? null,
    metadata: req.metadata ?? {},
    idempotency_key: req.idempotencyKey ?? null,
  }
}

export async function postImageGeneration(
  req: ImageGenerateRequest,
  idempotencyKey: string,
): Promise<ImageGenerateResponse> {
  return apiRequest<ImageGenerateResponse>('/api/generation/image', {
    method: 'POST',
    body: JSON.stringify(toSnake(req)),
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function postVideoGeneration(
  req: AsyncGenerateRequest,
  idempotencyKey: string,
): Promise<AsyncGenerateResponse> {
  return apiRequest<AsyncGenerateResponse>('/api/generation/video', {
    method: 'POST',
    body: JSON.stringify(toSnake(req)),
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function postAudioGeneration(
  req: AsyncGenerateRequest,
  idempotencyKey: string,
): Promise<AsyncGenerateResponse> {
  return apiRequest<AsyncGenerateResponse>('/api/generation/audio', {
    method: 'POST',
    body: JSON.stringify(toSnake(req)),
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function getGenerationJobs(
  workspaceId: string,
  opts?: { mode?: string; status?: string; cursor?: string; limit?: number },
): Promise<JobsPage> {
  const params = new URLSearchParams({ workspace_id: workspaceId })
  if (opts?.mode) params.set('mode', opts.mode)
  if (opts?.status) params.set('status', opts.status)
  if (opts?.cursor) params.set('cursor', opts.cursor)
  if (opts?.limit) params.set('limit', String(opts.limit))
  return apiRequest<JobsPage>(`/api/generation/jobs?${params}`)
}

export async function getInflightJobs(workspaceId: string): Promise<{ jobs: GenerationJob[] }> {
  return apiRequest<{ jobs: GenerationJob[] }>(
    `/api/generation/jobs?workspace_id=${workspaceId}&status=queued,preprocessing,running,postprocessing,persisting`,
  )
}

export async function deleteGenerationJob(jobId: string): Promise<void> {
  await apiRequest<void>(`/api/generation/jobs/${jobId}`, { method: 'DELETE' })
}

export async function patchFavorite(assetId: string): Promise<{ is_favorite: boolean }> {
  return apiRequest<{ is_favorite: boolean }>(`/api/generation/assets/${assetId}/favorite`, {
    method: 'PATCH',
  })
}
```

- [ ] **Step 2: Update query keys**

Replace `frontend/app/src/lib/api/query-keys.ts`:

```typescript
export const QK = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  generations: (workspaceId: string, mode?: string) =>
    mode ? (['generations', workspaceId, mode] as const) : (['generations', workspaceId] as const),
  generationJob: (jobId: string) => ['generation-job', jobId] as const,
  generationJobsInflight: (workspaceId: string) => ['generations-inflight', workspaceId] as const,
  datasets: (workspaceId: string) => ['datasets', workspaceId] as const,
  trainingJobs: (workspaceId: string) => ['training-jobs', workspaceId] as const,
  models: (workspaceId: string) => ['models', workspaceId] as const,
} as const
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/lib/api/generation.ts frontend/app/src/lib/api/query-keys.ts
git commit -m "feat(api-client): generation API client + updated query keys"
```

---

## Task 10: Zustand generation store

**Files:**
- Create: `frontend/app/src/lib/store/generation.ts`

- [ ] **Step 1: Create generation store**

Create `frontend/app/src/lib/store/generation.ts`:

```typescript
'use client'

import { create } from 'zustand'
import type { GenerationJob, GenerationStatus, Asset } from '@aether/types'

export interface ActiveGenerationState {
  jobId: string
  mode: string
  prompt: string
  status: GenerationStatus
  progress: number
  errorMessage: string | null
  assets: Asset[]
  createdAt: number  // timestamp for sorting
}

interface GenerationStore {
  activeJobs: Record<string, ActiveGenerationState>
  focusedJobId: string | undefined

  setActiveJob(job: ActiveGenerationState): void
  updateProgress(jobId: string, status: GenerationStatus, progress: number): void
  completeJob(jobId: string, assets: Asset[]): void
  failJob(jobId: string, error: string): void
  cancelJob(jobId: string): void
  hydrateFromServer(jobs: GenerationJob[]): void
  setFocusedJob(jobId: string): void
  clearCompleted(): void
}

const FOCUSED_KEY = 'aether_focused_job'

function loadFocusedId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return sessionStorage.getItem(FOCUSED_KEY) ?? undefined
}

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  activeJobs: {},
  focusedJobId: loadFocusedId(),

  setActiveJob(job) {
    set((s) => ({
      activeJobs: { ...s.activeJobs, [job.jobId]: job },
      focusedJobId: job.jobId,
    }))
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(FOCUSED_KEY, job.jobId)
    }
  },

  updateProgress(jobId, status, progress) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status, progress },
        },
      }
    })
  },

  completeJob(jobId, assets) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status: 'completed', progress: 100, assets },
        },
      }
    })
  },

  failJob(jobId, error) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status: 'failed', errorMessage: error },
        },
      }
    })
  },

  cancelJob(jobId) {
    set((s) => {
      const existing = s.activeJobs[jobId]
      if (!existing) return s
      return {
        activeJobs: {
          ...s.activeJobs,
          [jobId]: { ...existing, status: 'cancelled' },
        },
      }
    })
  },

  hydrateFromServer(jobs) {
    const incoming: Record<string, ActiveGenerationState> = {}
    for (const job of jobs) {
      incoming[job.id] = {
        jobId: job.id,
        mode: job.mode,
        prompt: job.prompt,
        status: job.status,
        progress: job.progress,
        errorMessage: job.errorMessage,
        assets: job.assets,
        createdAt: new Date(job.createdAt).getTime(),
      }
    }
    set((s) => ({
      activeJobs: { ...s.activeJobs, ...incoming },
    }))
  },

  setFocusedJob(jobId) {
    set({ focusedJobId: jobId })
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(FOCUSED_KEY, jobId)
    }
  },

  clearCompleted() {
    set((s) => {
      const next: Record<string, ActiveGenerationState> = {}
      for (const [id, job] of Object.entries(s.activeJobs)) {
        if (job.status !== 'completed' && job.status !== 'cancelled') {
          next[id] = job
        }
      }
      return { activeJobs: next }
    })
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/src/lib/store/generation.ts
git commit -m "feat(store): useGenerationStore — multi-job state, hydration, sessionStorage focus"
```

---

## Task 11: Reconciliation hook + WS event wiring

**Files:**
- Create: `frontend/app/src/lib/hooks/use-generation-reconcile.ts`

- [ ] **Step 1: Create reconciliation hook**

Create `frontend/app/src/lib/hooks/use-generation-reconcile.ts`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WSMessage, GenerationJob, Asset } from '@aether/types'
import { useGenerationStore } from '@/lib/store/generation'
import { getInflightJobs } from '@/lib/api/generation'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'

export function useGenerationReconcile(
  workspaceId: string,
  lastEvent: WSMessage | null,
) {
  const store = useGenerationStore()
  const queryClient = useQueryClient()
  const reconciled = useRef(false)

  // On mount: fetch in-flight jobs and hydrate store
  useEffect(() => {
    if (reconciled.current || !workspaceId) return
    reconciled.current = true

    getInflightJobs(workspaceId).then((data) => {
      if (data.jobs.length > 0) {
        store.hydrateFromServer(data.jobs)
      }
    }).catch(() => {
      // non-fatal — store starts empty
    })
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire WS events → store + query cache
  useEffect(() => {
    if (!lastEvent) return

    if (lastEvent.type === 'generation.progress') {
      store.updateProgress(
        lastEvent.jobId,
        lastEvent.payload.status,
        lastEvent.payload.progress,
      )
    }

    if (lastEvent.type === 'generation.completed') {
      const { job, assets } = lastEvent.payload
      store.completeJob(lastEvent.jobId, assets)

      // Optimistic prepend to gallery cache
      queryClient.setQueryData<{ pages: { jobs: GenerationJob[]; next_cursor: string | null }[] }>(
        QK.generations(workspaceId),
        (old) => {
          if (!old) return old
          const firstPage = old.pages[0]
          if (!firstPage) return old
          const alreadyPresent = firstPage.jobs.some((j) => j.id === job.id)
          if (alreadyPresent) return old
          return {
            ...old,
            pages: [
              { ...firstPage, jobs: [job, ...firstPage.jobs] },
              ...old.pages.slice(1),
            ],
          }
        },
      )

      toast.success('Generation complete — click to view')
    }

    if (lastEvent.type === 'generation.failed') {
      store.failJob(lastEvent.jobId, lastEvent.payload.error)
    }
  }, [lastEvent]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/src/lib/hooks/use-generation-reconcile.ts
git commit -m "feat(hooks): useGenerationReconcile — WS event wiring + store hydration on mount"
```

---

## Task 12: ControlsPanel component

**Files:**
- Create: `frontend/app/src/components/generate/controls-panel.tsx`

- [ ] **Step 1: Create controls panel**

Create `frontend/app/src/components/generate/controls-panel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { Loader2, Sparkles } from 'lucide-react'
import type { GenerationMode } from '@aether/types'
import { useAuthStore } from '@/lib/store/auth'
import { useGenerationStore } from '@/lib/store/generation'
import { useQueryClient } from '@tanstack/react-query'
import { postImageGeneration, postVideoGeneration, postAudioGeneration } from '@/lib/api/generation'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const MODES: { value: GenerationMode; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

const schema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  negativePrompt: z.string().max(1000).optional(),
  seed: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ControlsPanelProps {
  workspaceId: string
}

export function ControlsPanel({ workspaceId }: ControlsPanelProps) {
  const [mode, setMode] = useState<GenerationMode>('image')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const store = useGenerationStore()
  const queryClient = useQueryClient()
  const workspace = useAuthStore((s) => s.workspace)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    if (mode === 'text') return  // coming soon
    if (!workspaceId) return

    const idempotencyKey = nanoid()
    const seed = values.seed ? parseInt(values.seed, 10) : undefined
    const req = {
      prompt: values.prompt,
      negativePrompt: values.negativePrompt || undefined,
      seed: isNaN(seed!) ? undefined : seed,
    }

    // Optimistic active job
    store.setActiveJob({
      jobId: idempotencyKey,  // temp ID until real job_id returns
      mode,
      prompt: values.prompt,
      status: 'queued',
      progress: 0,
      errorMessage: null,
      assets: [],
      createdAt: Date.now(),
    })

    try {
      if (mode === 'image') {
        const result = await postImageGeneration(req, idempotencyKey)
        store.setActiveJob({
          jobId: result.job.id,
          mode,
          prompt: values.prompt,
          status: 'completed',
          progress: 100,
          errorMessage: null,
          assets: result.job.assets,
          createdAt: Date.now(),
        })
        // Remove the temp-id entry
        queryClient.invalidateQueries({ queryKey: QK.generations(workspaceId) })
      } else if (mode === 'video') {
        const result = await postVideoGeneration(req, idempotencyKey)
        store.setActiveJob({
          jobId: result.job_id,
          mode,
          prompt: values.prompt,
          status: 'queued',
          progress: 0,
          errorMessage: null,
          assets: [],
          createdAt: Date.now(),
        })
      } else if (mode === 'audio') {
        const result = await postAudioGeneration(req, idempotencyKey)
        store.setActiveJob({
          jobId: result.job_id,
          mode,
          prompt: values.prompt,
          status: 'queued',
          progress: 0,
          errorMessage: null,
          assets: [],
          createdAt: Date.now(),
        })
      }
    } catch (err) {
      store.failJob(idempotencyKey, err instanceof ApiError ? err.message : 'Generation failed')
      if (err instanceof ApiError && err.status === 402) {
        toast.error('Not enough credits')
      } else {
        toast.error('Generation failed — please try again')
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              mode === m.value
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/15',
              m.value === 'text' && 'opacity-50 cursor-not-allowed',
            )}
            disabled={m.value === 'text'}
            title={m.value === 'text' ? 'Coming in next sprint' : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 flex-1">
        {/* Prompt */}
        <div className="flex flex-col gap-1">
          <textarea
            {...register('prompt')}
            placeholder="Describe the scene…"
            rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
          />
          {errors.prompt && (
            <p className="text-red-400 text-xs">{errors.prompt.message}</p>
          )}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-white/40 hover:text-white/60 text-left"
        >
          {showAdvanced ? '▲ Hide' : '▼ Advanced'}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Negative prompt</label>
              <input
                {...register('negativePrompt')}
                placeholder="What to avoid…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Seed (optional)</label>
              <input
                {...register('seed')}
                type="number"
                placeholder="Random"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={isSubmitting || mode === 'text'}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 rounded-full text-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isSubmitting ? 'Generating…' : '✦ Generate'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/src/components/generate/controls-panel.tsx
git commit -m "feat(generate): ControlsPanel — mode selector, prompt form, generate button"
```

---

## Task 13: Output components

**Files:**
- Create: `frontend/app/src/components/generate/outputs/image-output.tsx`
- Create: `frontend/app/src/components/generate/outputs/video-output.tsx`
- Create: `frontend/app/src/components/generate/outputs/audio-output.tsx`
- Create: `frontend/app/src/components/generate/outputs/text-coming-soon.tsx`
- Create: `frontend/app/src/components/generate/output-panel.tsx`

- [ ] **Step 1: Image output**

Create `frontend/app/src/components/generate/outputs/image-output.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Heart, Loader2 } from 'lucide-react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { patchFavorite } from '@/lib/api/generation'

interface Props {
  job: ActiveGenerationState
}

export function ImageOutput({ job }: Props) {
  const asset = job.assets[0]
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [retries, setRetries] = useState(0)
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  if (!asset) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    )
  }

  const handleError = () => {
    if (retries < 3) {
      setTimeout(() => setRetries((r) => r + 1), 1000)
    } else {
      setImgError(true)
    }
  }

  const handleFavorite = async () => {
    setIsFavorite((v) => !v)
    try {
      const res = await patchFavorite(asset.id)
      setIsFavorite(res.is_favorite)
    } catch {
      setIsFavorite((v) => !v)
    }
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = asset.storageKey
    a.download = `aether-${asset.id}.png`
    a.click()
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {!imgLoaded && !imgError && (
        <div className="absolute inset-0 skeleton-shimmer rounded-xl" />
      )}
      {imgError ? (
        <p className="text-white/40 text-sm">Failed to load image</p>
      ) : (
        <AnimatePresence>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            key={`${asset.id}-${retries}`}
            src={asset.storageKey}
            alt={job.prompt}
            className="max-w-full max-h-full rounded-xl object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={handleError}
          />
        </AnimatePresence>
      )}

      {imgLoaded && (
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button
            onClick={handleFavorite}
            className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white/70'}`} />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
          >
            <Download className="w-4 h-4 text-white/70" />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Video output**

Create `frontend/app/src/components/generate/outputs/video-output.tsx`:

```typescript
'use client'

import { Download, Heart } from 'lucide-react'
import { useState } from 'react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { patchFavorite } from '@/lib/api/generation'

interface Props {
  job: ActiveGenerationState
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued…',
  preprocessing: 'Preparing…',
  running: 'Generating…',
  postprocessing: 'Finishing…',
  persisting: 'Saving…',
}

export function VideoOutput({ job }: Props) {
  const asset = job.assets[0]
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  if (job.status !== 'completed' || !asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full">
        <p className="text-white/60 text-sm font-medium">
          {STAGE_LABELS[job.status] ?? job.status}
        </p>
        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <p className="text-white/30 text-xs">{job.progress}%</p>
      </div>
    )
  }

  const handleFavorite = async () => {
    setIsFavorite((v) => !v)
    try {
      const res = await patchFavorite(asset.id)
      setIsFavorite(res.is_favorite)
    } catch {
      setIsFavorite((v) => !v)
    }
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <video
        src={asset.storageKey}
        className="max-w-full max-h-full rounded-xl"
        controls
        autoPlay
        loop
      />
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          onClick={handleFavorite}
          className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white/70'}`} />
        </button>
        <a
          href={asset.storageKey}
          download={`aether-${asset.id}.mp4`}
          className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
        >
          <Download className="w-4 h-4 text-white/70" />
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Audio output**

Create `frontend/app/src/components/generate/outputs/audio-output.tsx`:

```typescript
'use client'

import { Download, Heart } from 'lucide-react'
import { useState } from 'react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { patchFavorite } from '@/lib/api/generation'

interface Props {
  job: ActiveGenerationState
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued…',
  preprocessing: 'Preparing…',
  running: 'Composing…',
  postprocessing: 'Finishing…',
  persisting: 'Saving…',
}

export function AudioOutput({ job }: Props) {
  const asset = job.assets[0]
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  if (job.status !== 'completed' || !asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full">
        <div className="flex gap-1 items-end h-12">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-white/30 rounded-full animate-pulse"
              style={{
                height: `${20 + Math.sin(i * 0.8) * 18}px`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
        <p className="text-white/60 text-sm">{STAGE_LABELS[job.status] ?? job.status}</p>
        <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>
    )
  }

  const handleFavorite = async () => {
    setIsFavorite((v) => !v)
    try {
      const res = await patchFavorite(asset.id)
      setIsFavorite(res.is_favorite)
    } catch {
      setIsFavorite((v) => !v)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full p-6">
      <div className="flex gap-1 items-end h-16">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="w-1 bg-white/50 rounded-full"
            style={{ height: `${10 + Math.abs(Math.sin(i * 0.5)) * 40}px` }}
          />
        ))}
      </div>
      <audio src={asset.storageKey} controls className="w-full max-w-sm" />
      <div className="flex gap-2">
        <button
          onClick={handleFavorite}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white/70'}`} />
        </button>
        <a
          href={asset.storageKey}
          download={`aether-${asset.id}.wav`}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Download className="w-4 h-4 text-white/70" />
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Text coming soon**

Create `frontend/app/src/components/generate/outputs/text-coming-soon.tsx`:

```typescript
import { Sparkles } from 'lucide-react'

export function TextComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-8">
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-white/30" />
      </div>
      <p className="text-white/60 font-medium">Text generation coming in Sprint 3</p>
      <p className="text-white/30 text-sm">
        Streaming token-by-token output via HuggingFace Router is on the roadmap.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Output panel dispatcher**

Create `frontend/app/src/components/generate/output-panel.tsx`:

```typescript
'use client'

import { useGenerationStore } from '@/lib/store/generation'
import { ImageOutput } from './outputs/image-output'
import { VideoOutput } from './outputs/video-output'
import { AudioOutput } from './outputs/audio-output'
import { TextComingSoon } from './outputs/text-coming-soon'

interface OutputPanelProps {
  mode: string
}

export function OutputPanel({ mode }: OutputPanelProps) {
  const { activeJobs, focusedJobId } = useGenerationStore()
  const focusedJob = focusedJobId ? activeJobs[focusedJobId] : undefined

  if (mode === 'text') return <TextComingSoon />

  if (!focusedJob) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-white/20 text-sm">Output will appear here after generation</p>
      </div>
    )
  }

  if (focusedJob.mode === 'image') return <ImageOutput job={focusedJob} />
  if (focusedJob.mode === 'video') return <VideoOutput job={focusedJob} />
  if (focusedJob.mode === 'audio') return <AudioOutput job={focusedJob} />

  return <TextComingSoon />
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/components/generate/
git commit -m "feat(generate): output components — image/video/audio outputs + OutputPanel dispatcher"
```

---

## Task 14: GenerationCard

**Files:**
- Create: `frontend/app/src/components/generate/generation-card.tsx`

- [ ] **Step 1: Create GenerationCard**

Create `frontend/app/src/components/generate/generation-card.tsx`:

```typescript
'use client'

import { motion } from 'framer-motion'
import { Download, Heart, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { ActiveGenerationState } from '@/lib/store/generation'
import { useGenerationStore } from '@/lib/store/generation'
import { deleteGenerationJob, patchFavorite, postImageGeneration, postVideoGeneration, postAudioGeneration } from '@/lib/api/generation'
import { nanoid } from 'nanoid'
import { cn } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  preprocessing: 'Preparing',
  running: 'Generating',
  postprocessing: 'Finishing',
  persisting: 'Saving',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

interface Props {
  job: ActiveGenerationState
  workspaceId: string
  onClick?: () => void
}

export function GenerationCard({ job, workspaceId, onClick }: Props) {
  const store = useGenerationStore()
  const asset = job.assets[0]
  const isActive = !['completed', 'failed', 'cancelled'].includes(job.status)
  const [isFavorite, setIsFavorite] = useState(asset?.isFavorite ?? false)

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!asset) return
    setIsFavorite((v) => !v)
    try {
      const res = await patchFavorite(asset.id)
      setIsFavorite(res.is_favorite)
    } catch {
      setIsFavorite((v) => !v)
    }
  }

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteGenerationJob(job.jobId)
      store.cancelJob(job.jobId)
    } catch { /* ignore */ }
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ik = nanoid()
    store.setActiveJob({
      jobId: ik,
      mode: job.mode,
      prompt: job.prompt,
      status: 'queued',
      progress: 0,
      errorMessage: null,
      assets: [],
      createdAt: Date.now(),
    })
    try {
      if (job.mode === 'image') await postImageGeneration({ prompt: job.prompt }, ik)
      else if (job.mode === 'video') await postVideoGeneration({ prompt: job.prompt }, ik)
      else if (job.mode === 'audio') await postAudioGeneration({ prompt: job.prompt }, ik)
    } catch { /* handled by WS failure event */ }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'relative rounded-xl border overflow-hidden cursor-pointer group',
        'bg-[#0c0f1a] border-white/10',
        isActive && 'border-white/20',
      )}
    >
      {/* Thumbnail / active state */}
      {job.status === 'completed' && asset ? (
        <div className="aspect-square relative">
          {asset.type === 'image' && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={asset.storageKey}
              alt={job.prompt}
              className="w-full h-full object-cover"
            />
          )}
          {asset.type === 'video' && (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <span className="text-white/40 text-xs">▶ Video</span>
            </div>
          )}
          {asset.type === 'audio' && (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <div className="flex gap-0.5 items-end h-8">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-white/40 rounded-full"
                    style={{ height: `${6 + Math.abs(Math.sin(i * 0.7)) * 18}px` }}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Hover actions */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 gap-1.5">
            <button onClick={handleFavorite} className="p-1.5 rounded-full bg-black/60">
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white'}`} />
            </button>
            <a
              href={asset.storageKey}
              download={`aether-${asset.id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full bg-black/60"
            >
              <Download className="w-3.5 h-3.5 text-white" />
            </a>
          </div>
        </div>
      ) : (
        <div className="aspect-square flex flex-col items-center justify-center gap-2 p-4">
          {isActive ? (
            <>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/50 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${job.progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="text-white/50 text-xs">{STAGE_LABELS[job.status]}</p>
              <button onClick={handleCancel} className="mt-1">
                <X className="w-3.5 h-3.5 text-white/30 hover:text-white/60" />
              </button>
            </>
          ) : job.status === 'failed' ? (
            <>
              <p className="text-red-400/70 text-xs text-center line-clamp-2">{job.errorMessage ?? 'Failed'}</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </>
          ) : (
            <p className="text-white/30 text-xs">Cancelled</p>
          )}
        </div>
      )}

      {/* Mode badge */}
      <div className="px-2 py-1.5">
        <p className="text-white/40 text-xs truncate">{job.prompt}</p>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/src/components/generate/generation-card.tsx
git commit -m "feat(generate): GenerationCard — all 8 states, actions, Framer Motion animations"
```

---

## Task 15: GenerationHistory (gallery)

**Files:**
- Create: `frontend/app/src/components/generate/generation-history.tsx`

- [ ] **Step 1: Install react-virtual**

```bash
cd frontend/app && pnpm add @tanstack/react-virtual
```

- [ ] **Step 2: Create GenerationHistory**

Create `frontend/app/src/components/generate/generation-history.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { useGenerationStore } from '@/lib/store/generation'
import { getGenerationJobs } from '@/lib/api/generation'
import { QK } from '@/lib/api/query-keys'
import { GenerationCard } from './generation-card'
import type { GenerationMode } from '@aether/types'

const MODE_FILTERS: { value: GenerationMode | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

interface Props {
  workspaceId: string
}

export function GenerationHistory({ workspaceId }: Props) {
  const [modeFilter, setModeFilter] = useState<GenerationMode | 'all'>('all')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const store = useGenerationStore()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: QK.generations(workspaceId, modeFilter === 'all' ? undefined : modeFilter),
    queryFn: ({ pageParam }) =>
      getGenerationJobs(workspaceId, {
        mode: modeFilter === 'all' ? undefined : modeFilter,
        cursor: pageParam as string | undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const persistedJobs = data?.pages.flatMap((p) => p.jobs) ?? []
  const activeJobsList = Object.values(store.activeJobs)
    .filter((j) => ['queued', 'preprocessing', 'running', 'postprocessing', 'persisting'].includes(j.status))
    .filter((j) => modeFilter === 'all' || j.mode === modeFilter)
    .sort((a, b) => b.createdAt - a.createdAt)

  // Deduplicate: active jobs take precedence over persisted (same id)
  const persistedIds = new Set(activeJobsList.map((j) => j.jobId))
  const filteredPersisted = persistedJobs.filter((j) => !persistedIds.has(j.id))

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex gap-2">
        {MODE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setModeFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              modeFilter === f.value
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/60 hover:bg-white/15'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <AnimatePresence initial={false}>
          {activeJobsList.map((job) => (
            <GenerationCard
              key={job.jobId}
              job={job}
              workspaceId={workspaceId}
              onClick={() => store.setFocusedJob(job.jobId)}
            />
          ))}
          {filteredPersisted.map((job) => {
            const active = store.activeJobs[job.id]
            const displayJob = active ?? {
              jobId: job.id,
              mode: job.mode,
              prompt: job.prompt,
              status: job.status,
              progress: job.progress,
              errorMessage: job.errorMessage,
              assets: job.assets,
              createdAt: new Date(job.createdAt).getTime(),
            }
            return (
              <GenerationCard
                key={job.id}
                job={displayJob}
                workspaceId={workspaceId}
                onClick={() => store.setFocusedJob(job.id)}
              />
            )
          })}
        </AnimatePresence>
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && (
        <p className="text-white/30 text-xs text-center">Loading more…</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/generate/generation-history.tsx
git commit -m "feat(generate): GenerationHistory — infinite scroll grid, mode filters, realtime prepend"
```

---

## Task 16: Generate page assembly

**Files:**
- Create: `frontend/app/src/app/workspace/generate/page.tsx`

- [ ] **Step 1: Create generate page**

Create `frontend/app/src/app/workspace/generate/page.tsx`:

```typescript
'use client'

import { useAuthStore } from '@/lib/store/auth'
import { WorkspaceShell } from '@/components/workspace/app-shell'
import { ControlsPanel } from '@/components/generate/controls-panel'
import { OutputPanel } from '@/components/generate/output-panel'
import { GenerationHistory } from '@/components/generate/generation-history'
import { useGenerationReconcile } from '@/lib/hooks/use-generation-reconcile'
import { useWorkspaceWebSocket } from '@/lib/hooks/use-websocket'
import { useGenerationStore } from '@/lib/store/generation'
import { useState } from 'react'
import type { GenerationMode } from '@aether/types'

export default function GeneratePage() {
  const workspace = useAuthStore((s) => s.workspace)
  const workspaceId = workspace?.id ?? ''
  const [activeMode, setActiveMode] = useState<GenerationMode>('image')

  const { lastEvent } = useWorkspaceWebSocket(workspaceId)
  useGenerationReconcile(workspaceId, lastEvent)

  return (
    <WorkspaceShell>
      <div className="flex flex-col h-full gap-6 p-6">
        {/* Studio: side-by-side */}
        <div className="grid grid-cols-[320px_1fr] gap-4 min-h-[480px]">
          {/* Left: controls */}
          <div className="bg-[#0c0f1a] border border-white/10 rounded-2xl p-5">
            <ControlsPanel workspaceId={workspaceId} />
          </div>

          {/* Right: output */}
          <div className="bg-[#0c0f1a] border border-white/10 rounded-2xl p-5">
            <OutputPanel mode={activeMode} />
          </div>
        </div>

        {/* Gallery: derived from generation state */}
        <div className="bg-[#0c0f1a] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white/60 mb-4">Recent generations</h2>
          {workspaceId ? (
            <GenerationHistory workspaceId={workspaceId} />
          ) : (
            <p className="text-white/20 text-sm">Loading workspace…</p>
          )}
        </div>
      </div>
    </WorkspaceShell>
  )
}
```

- [ ] **Step 2: Update middleware to protect the route**

In `frontend/app/src/middleware.ts`, ensure `/workspace/generate` is in the protected routes matcher. Check the current matcher config — if it already covers `/workspace/:path*`, no change needed. If not, add `/workspace/generate` to the protected list.

- [ ] **Step 3: Build check**

```bash
cd frontend/app && pnpm build
```

Expected: build succeeds. Fix any TypeScript errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/app/workspace/generate/
git commit -m "feat(pages): /workspace/generate — studio layout wiring ControlsPanel + OutputPanel + GenerationHistory"
```

---

## Task 17: Self-review and final integration check

- [ ] **Step 1: Verify spec coverage**

Check each spec requirement has a task:
- [x] DB tables: generation_jobs, assets, generation_job_inputs — Task 3
- [x] credits_reserved — Tasks 2 + 3
- [x] GenerationService state machine — Task 6
- [x] InferenceProvider protocol + HuggingFaceProvider — Task 5
- [x] Image sync endpoint — Task 7
- [x] Video/audio async endpoints — Task 7
- [x] Gallery feed with keyset pagination — Task 7
- [x] Cancel / delete — Task 7
- [x] Favorite toggle — Task 7
- [x] WS event envelope — Task 6
- [x] useGenerationStore multi-job — Task 10
- [x] Reconciliation on mount — Task 11
- [x] WS event → store + cache wiring — Task 11
- [x] ControlsPanel — Task 12
- [x] OutputPanel + mode outputs — Task 13
- [x] GenerationCard all 8 states — Task 14
- [x] GenerationHistory infinite scroll — Task 15
- [x] /workspace/generate page — Task 16

- [ ] **Step 2: Run backend test suite**

```bash
cd backend/api && python -m pytest tests/ -v
```

Expected: all tests pass including Sprint 1 auth tests.

- [ ] **Step 3: Run frontend build**

```bash
cd frontend/app && pnpm build
```

Expected: zero TypeScript errors, clean build.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Sprint 2 Generation Studio — complete implementation"
```
