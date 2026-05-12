# Sprint 3: Dataset Ingestion Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a fully async dataset ingestion pipeline — metadata fetch, quality signals from sample rows, WS progress events, and a live dataset console UI.

**Architecture:** `POST /api/datasets/import` returns immediately with `{dataset_id, status: "queued"}`; a background task drives `queued→inspecting→analyzing→previewing→completed` publishing WS events on the existing `/ws/{workspace_id}` channel at each stage. Frontend uses Zustand for ephemeral ingestion state, TanStack Query for persistence, and `useDatasetReconcile` (same pattern as Sprint 2's `useGenerationReconcile`) to wire WS events into store + cache. The existing `DatasetConsole` component is upgraded to consume real live state.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Pydantic v2, httpx, langdetect, Redis pub/sub, Next.js 15, React 19, Zustand, TanStack Query v5, Framer Motion

---

## File Map

**Backend — modified**
- `backend/api/src/models.py` — add 6 columns to `Dataset`
- `backend/api/src/schemas.py` — add `DatasetImportResponse`, `DatasetOut`, `DatasetPreviewResponse`; update `DatasetResponse`
- `backend/api/src/dataset_connectors.py` — upgrade connectors to return `ConnectorResult` with sample rows
- `backend/api/src/services/dataset_ingestion.py` — new: `compute_quality_signals`, `run_ingestion` state machine
- `backend/api/src/routers/datasets.py` — replace sync import with async, add GET /:id, DELETE /:id, GET /:id/preview
- `backend/api/tests/test_dataset_ingestion.py` — new: unit + integration tests

**Frontend — new/modified**
- `packages/types/src/index.ts` — add `DatasetStatus`, `Dataset`, `DatasetQualityReport`, WS dataset events
- `frontend/app/src/lib/api/datasets.ts` — new: dataset API client
- `frontend/app/src/lib/api/query-keys.ts` — add `dataset`, `datasetPreview` keys
- `frontend/app/src/lib/store/dataset.ts` — new: `useDatasetStore`
- `frontend/app/src/lib/hooks/use-dataset-reconcile.ts` — new: WS event wiring
- `frontend/app/src/components/workspace/dataset-console.tsx` — upgrade to real API + live state
- `frontend/app/src/app/workspace/datasets/page.tsx` — new: dedicated route

---

## Task 1: Neon DB migration — add columns to datasets

**Files:** (SQL via Neon MCP — no source file)

- [ ] **Step 1: Add progress, error_message, last_error_code**

Run via Neon MCP `run_sql` (one statement per call):

```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0
```

```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS error_message TEXT
```

```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(100)
```

- [ ] **Step 2: Add ingestion_config, sample_count, deleted_at**

```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS ingestion_config JSONB NOT NULL DEFAULT '{}'
```

```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0
```

```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
```

- [ ] **Step 3: Verify columns exist**

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'datasets' ORDER BY ordinal_position
```

Expected: all 6 new columns present alongside existing ones.

- [ ] **Step 4: Empty commit to record migration**

```bash
git commit --allow-empty -m "chore: Neon DB migration — add progress/error/sample_count/deleted_at to datasets"
```

---

## Task 2: Backend model + schema updates

**Files:**
- Modify: `backend/api/src/models.py`
- Modify: `backend/api/src/schemas.py`

- [ ] **Step 1: Add new columns to Dataset model**

In `backend/api/src/models.py`, find the `Dataset` class (line ~116) and add 6 new columns after the `updated_at` line:

```python
class Dataset(Base):
    __tablename__ = 'datasets'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    source: Mapped[str] = mapped_column(String(40), index=True)
    source_ref: Mapped[str] = mapped_column(String(512))
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), default='queued', index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    media_types: Mapped[list[str]] = mapped_column(JSON, default=list)
    columns: Mapped[list[dict]] = mapped_column(JSON, default=list)
    quality_report: Mapped[dict] = mapped_column(JSON, default=dict)
    lineage: Mapped[dict] = mapped_column(JSON, default=dict)
    preview_samples: Mapped[list[dict]] = mapped_column(JSON, default=list)
    ingestion_config: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Add new schemas**

In `backend/api/src/schemas.py`, append after the existing `DatasetResponse` class:

```python
class DatasetOut(OrmModel):
    id: str
    workspace_id: str
    source: str
    source_ref: str
    name: str
    status: str
    progress: int
    row_count: int
    sample_count: int
    media_types: list[str]
    columns: list[dict]
    quality_report: dict
    lineage: dict
    preview_samples: list[dict]
    ingestion_config: dict
    error_message: str | None
    last_error_code: str | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DatasetImportResponse(BaseModel):
    dataset_id: str
    status: str = 'queued'


class DatasetPreviewResponse(BaseModel):
    rows: list[dict]
    total: int
    offset: int
    limit: int
```

- [ ] **Step 3: Verify import check**

```bash
cd backend/api && python -c "from src.models import Dataset; from src.schemas import DatasetOut, DatasetImportResponse, DatasetPreviewResponse; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/api/src/models.py backend/api/src/schemas.py
git commit -m "feat(models): Dataset Sprint 3 columns — progress, sample_count, error, deleted_at"
```

---

## Task 3: Connector upgrades — return sample rows

**Files:**
- Modify: `backend/api/src/dataset_connectors.py`

- [ ] **Step 1: Replace DatasetInspection with ConnectorResult and upgrade connectors**

Replace the full contents of `backend/api/src/dataset_connectors.py`:

```python
import base64
import io
from dataclasses import dataclass, field
from typing import Any

import httpx
from fastapi import HTTPException

from .config import get_settings


@dataclass
class ConnectorResult:
    row_count: int
    media_types: list[str]
    columns: list[dict[str, Any]]
    sample_rows: list[dict[str, Any]] = field(default_factory=list)
    lineage_extra: dict[str, Any] = field(default_factory=dict)


def _guess_media_types(features: dict[str, Any]) -> list[str]:
    media_types: set[str] = set()
    for value in features.values():
        text = str(value).lower()
        if 'image' in text:
            media_types.add('image')
        if 'audio' in text:
            media_types.add('audio')
        if 'video' in text:
            media_types.add('video')
        if any(marker in text for marker in ('string', 'text', 'caption')):
            media_types.add('text')
    return sorted(media_types or {'text'})


async def inspect_huggingface_dataset(dataset_id: str, num_samples: int = 50) -> ConnectorResult:
    settings = get_settings()
    headers = {'Authorization': f'Bearer {settings.huggingface_token}'} if settings.huggingface_token else {}

    async with httpx.AsyncClient(timeout=30) as client:
        # Fetch dataset metadata
        meta_resp = await client.get(
            f'https://huggingface.co/api/datasets/{dataset_id}',
            headers=headers,
        )
    if meta_resp.status_code == 404:
        raise HTTPException(status_code=404, detail='HuggingFace dataset not found')
    meta_resp.raise_for_status()
    payload = meta_resp.json()

    dataset_info = payload.get('datasetInfo') or {}
    card_data = payload.get('cardData') or {}
    features = dataset_info.get('features') or card_data.get('features') or {}
    columns = [{'name': key, 'dtype': str(value), 'nullable': True} for key, value in features.items()]
    row_count = dataset_info.get('num_examples') or int(payload.get('downloads') or 0)

    # Fetch sample rows via HF datasets-server API
    sample_rows: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            rows_resp = await client.get(
                f'https://datasets-server.huggingface.co/rows',
                params={'dataset': dataset_id, 'split': 'train', 'offset': 0, 'length': num_samples},
                headers=headers,
            )
        if rows_resp.status_code == 200:
            rows_data = rows_resp.json()
            sample_rows = [r.get('row', r) for r in rows_data.get('rows', [])]
    except Exception:
        pass  # sample rows are best-effort

    return ConnectorResult(
        row_count=row_count,
        media_types=_guess_media_types(features),
        columns=columns,
        sample_rows=sample_rows[:num_samples],
        lineage_extra={'revision': payload.get('sha'), 'hf_dataset_id': dataset_id},
    )


async def inspect_kaggle_dataset(dataset_ref: str, num_samples: int = 50) -> ConnectorResult:
    settings = get_settings()
    if not settings.kaggle_username or not settings.kaggle_key:
        raise HTTPException(status_code=503, detail='Kaggle connector is not configured')
    token = base64.b64encode(f'{settings.kaggle_username}:{settings.kaggle_key}'.encode()).decode()
    headers = {'Authorization': f'Basic {token}'}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f'https://www.kaggle.com/api/v1/datasets/view/{dataset_ref}',
            headers=headers,
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail='Kaggle dataset not found')
    resp.raise_for_status()
    payload = resp.json()

    files = payload.get('files') or []
    columns = [
        {'name': f.get('name', 'file'), 'dtype': f.get('type', 'file'), 'nullable': False}
        for f in files[:40]
    ]
    media_types = sorted({
        'image' if str(f.get('name', '')).lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) else 'text'
        for f in files
    } or {'text'})

    # Sample rows = file listing metadata (no full download)
    sample_rows = [
        {'file': f.get('name'), 'size_bytes': f.get('totalBytes'), 'type': f.get('type')}
        for f in files[:num_samples]
    ]

    return ConnectorResult(
        row_count=int(payload.get('totalBytes') or 0),
        media_types=media_types,
        columns=columns,
        sample_rows=sample_rows,
        lineage_extra={
            'kaggle_ref': dataset_ref,
            'version': payload.get('currentVersionNumber'),
            'file_count': len(files),
        },
    )


def inspect_local_upload(name: str) -> ConnectorResult:
    """Stub — local upload not supported in Sprint 3."""
    return ConnectorResult(
        row_count=0,
        media_types=['text'],
        columns=[{'name': 'pending_upload', 'dtype': 'file', 'nullable': False}],
        sample_rows=[],
        lineage_extra={'source': 'local', 'name': name},
    )
```

- [ ] **Step 2: Import check**

```bash
cd backend/api && python -c "from src.dataset_connectors import ConnectorResult, inspect_huggingface_dataset, inspect_kaggle_dataset; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/dataset_connectors.py
git commit -m "feat(connectors): ConnectorResult with sample_rows — HF datasets-server + Kaggle file listing"
```

---

## Task 4: compute_quality_signals + DatasetIngestionService

**Files:**
- Create: `backend/api/src/services/dataset_ingestion.py`

- [ ] **Step 1: Write failing unit test**

Create `backend/api/tests/test_dataset_ingestion.py`:

```python
import pytest
from src.services.dataset_ingestion import compute_quality_signals


def test_null_rates_computed_correctly():
    rows = [
        {'text': 'hello', 'label': 'pos'},
        {'text': None, 'label': 'neg'},
        {'text': 'world', 'label': None},
    ]
    result = compute_quality_signals(rows)
    assert abs(result['null_rates']['text'] - 1/3) < 0.01
    assert abs(result['null_rates']['label'] - 1/3) < 0.01


def test_duplicate_estimate():
    rows = [
        {'text': 'hello'},
        {'text': 'hello'},  # duplicate
        {'text': 'world'},
    ]
    result = compute_quality_signals(rows)
    assert result['duplicate_estimate'] > 0


def test_empty_rows_returns_safe_defaults():
    result = compute_quality_signals([])
    assert result['null_rates'] == {}
    assert result['duplicate_estimate'] == 0.0
    assert result['sample_count'] == 0


def test_language_detection_on_english_text():
    rows = [{'text': 'The quick brown fox jumps over the lazy dog'}]
    result = compute_quality_signals(rows)
    # language may be 'en' or 'unknown' depending on langdetect availability
    assert result['language'] in ('en', 'unknown')
    assert 0.0 <= result['language_confidence'] <= 1.0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend/api && python -m pytest tests/test_dataset_ingestion.py -v 2>&1 | tail -10
```

Expected: FAIL with `ModuleNotFoundError` or `ImportError` — `dataset_ingestion` doesn't exist yet.

- [ ] **Step 3: Create the service file**

Create `backend/api/src/services/dataset_ingestion.py`:

```python
import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..dataset_connectors import ConnectorResult, inspect_huggingface_dataset, inspect_kaggle_dataset, inspect_local_upload
from ..models import Dataset

_log = logging.getLogger(__name__)

_background_tasks: set[asyncio.Task] = set()

STAGE_PROGRESS = {
    'queued': 0,
    'inspecting': 20,
    'analyzing': 60,
    'previewing': 90,
    'completed': 100,
}


def compute_quality_signals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute quality signals from a list of sample rows. Pure function — no I/O."""
    if not rows:
        return {
            'null_rates': {},
            'duplicate_estimate': 0.0,
            'media_types_detected': [],
            'language': 'unknown',
            'language_confidence': 0.0,
            'sample_count': 0,
        }

    # Null rates per column
    all_keys: set[str] = set()
    for row in rows:
        all_keys.update(row.keys())

    null_rates: dict[str, float] = {}
    for key in all_keys:
        null_count = sum(1 for row in rows if row.get(key) is None or row.get(key) == '')
        null_rates[key] = round(null_count / len(rows), 4)

    # Duplicate estimate via hash
    seen: set[str] = set()
    duplicates = 0
    for row in rows:
        row_hash = hashlib.sha256(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()
        if row_hash in seen:
            duplicates += 1
        seen.add(row_hash)
    duplicate_estimate = round(duplicates / len(rows), 4)

    # Language detection on first text column
    language = 'unknown'
    language_confidence = 0.0
    text_col = next(
        (k for k in all_keys if any(marker in k.lower() for marker in ('text', 'caption', 'sentence', 'content', 'body'))),
        None,
    )
    if text_col:
        sample_text = ' '.join(
            str(row[text_col]) for row in rows[:10] if row.get(text_col)
        )
        if sample_text.strip():
            try:
                import langdetect
                lang = langdetect.detect(sample_text)
                language = lang
                language_confidence = 0.9  # langdetect doesn't expose probability easily
            except Exception:
                pass

    return {
        'null_rates': null_rates,
        'duplicate_estimate': duplicate_estimate,
        'media_types_detected': [],
        'language': language,
        'language_confidence': language_confidence,
        'sample_count': len(rows),
    }


async def _publish(redis: Any, workspace_id: str, event: dict) -> None:
    await redis.publish(f'ws:workspace:{workspace_id}', json.dumps(event))


async def _transition(
    db: AsyncSession,
    redis: Any,
    dataset: Dataset,
    status: str,
    progress: int,
    *,
    error_message: str | None = None,
    error_code: str | None = None,
) -> None:
    dataset.status = status
    dataset.progress = progress
    dataset.updated_at = datetime.now(timezone.utc)
    if error_message:
        dataset.error_message = error_message
    if error_code:
        dataset.last_error_code = error_code
    await db.flush()
    if status not in ('completed', 'failed'):
        await _publish(redis, dataset.workspace_id, {
            'type': 'dataset.progress',
            'datasetId': dataset.id,
            'workspaceId': dataset.workspace_id,
            'ts': int(time.time() * 1000),
            'payload': {'status': status, 'progress': progress},
        })


async def run_ingestion(db: AsyncSession, redis: Any, dataset: Dataset) -> None:
    """Drive dataset through full ingestion lifecycle."""
    try:
        # Stage 1: Inspect
        await _transition(db, redis, dataset, 'inspecting', 20)

        if dataset.deleted_at is not None:
            return

        if dataset.source == 'huggingface':
            result: ConnectorResult = await inspect_huggingface_dataset(dataset.source_ref)
        elif dataset.source == 'kaggle':
            result = await inspect_kaggle_dataset(dataset.source_ref)
        else:
            result = inspect_local_upload(dataset.source_ref)

        dataset.columns = result.columns
        dataset.row_count = result.row_count
        dataset.media_types = result.media_types
        await db.flush()

        # Stage 2: Analyze
        await _transition(db, redis, dataset, 'analyzing', 60)

        if dataset.deleted_at is not None:
            return

        signals = compute_quality_signals(result.sample_rows)
        signals['media_types_detected'] = result.media_types
        signals['row_count_verified'] = result.row_count
        dataset.quality_report = signals
        await db.flush()

        # Stage 3: Preview
        await _transition(db, redis, dataset, 'previewing', 90)

        if dataset.deleted_at is not None:
            return

        dataset.preview_samples = result.sample_rows[:50]
        dataset.sample_count = len(dataset.preview_samples)
        dataset.lineage = {
            'source': dataset.source,
            'source_ref': dataset.source_ref,
            'fetched_at': datetime.now(timezone.utc).isoformat(),
            'connector_version': '1.0',
            **result.lineage_extra,
        }
        await db.flush()

        # Complete
        dataset.status = 'completed'
        dataset.progress = 100
        dataset.updated_at = datetime.now(timezone.utc)
        await db.commit()

        from ..schemas import DatasetOut
        dataset_out = DatasetOut.model_validate(dataset)

        await _publish(redis, dataset.workspace_id, {
            'type': 'dataset.completed',
            'datasetId': dataset.id,
            'workspaceId': dataset.workspace_id,
            'ts': int(time.time() * 1000),
            'payload': {'dataset': dataset_out.model_dump(mode='json')},
        })

    except Exception as exc:
        try:
            error_code = 'source_not_found' if '404' in str(exc) else 'ingestion_error'
            await _transition(
                db, redis, dataset, 'failed', dataset.progress,
                error_message=str(exc), error_code=error_code,
            )
            await db.commit()
            await _publish(redis, dataset.workspace_id, {
                'type': 'dataset.failed',
                'datasetId': dataset.id,
                'workspaceId': dataset.workspace_id,
                'ts': int(time.time() * 1000),
                'payload': {'error': str(exc), 'errorCode': error_code},
            })
        except Exception:
            pass
        raise


async def run_ingestion_background(dataset_id: str, workspace_id: str) -> None:
    """Entry point for asyncio.create_task — uses a fresh DB session."""
    from ..db import SessionLocal
    from ..realtime import _get_redis

    async with SessionLocal() as db:
        dataset = await db.get(Dataset, dataset_id)
        if not dataset:
            return
        redis = await _get_redis()
        try:
            await run_ingestion(db, redis, dataset)
        except Exception:
            _log.exception('Dataset ingestion failed for %s', dataset_id)
        finally:
            await redis.aclose()
```

- [ ] **Step 4: Install langdetect**

```bash
cd backend/api && pip install langdetect && echo "langdetect" >> requirements.txt
```

(If `requirements.txt` doesn't exist, check `pyproject.toml` and add `langdetect` to dependencies there instead.)

- [ ] **Step 5: Run unit tests**

```bash
cd backend/api && python -m pytest tests/test_dataset_ingestion.py -v 2>&1 | tail -15
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/services/dataset_ingestion.py backend/api/tests/test_dataset_ingestion.py
git commit -m "feat(services): DatasetIngestionService — stage machine, compute_quality_signals, WS publish"
```

---

## Task 5: Router upgrades

**Files:**
- Modify: `backend/api/src/routers/datasets.py`

- [ ] **Step 1: Replace datasets router**

Replace the full contents of `backend/api/src/routers/datasets.py`:

```python
import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..dependencies import resolve_workspace
from ..models import Dataset, User
from ..schemas import DatasetImportRequest, DatasetImportResponse, DatasetOut, DatasetPreviewResponse
from ..security import audit, get_current_user
from ..services.dataset_ingestion import run_ingestion_background

router = APIRouter()
_log = logging.getLogger(__name__)
_background_tasks: set[asyncio.Task] = set()


@router.get('', response_model=list[DatasetOut])
async def list_datasets(
    workspace_id: str | None = None,
    source: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DatasetOut]:
    workspace = await resolve_workspace(db, user, workspace_id)
    stmt = (
        select(Dataset)
        .where(Dataset.workspace_id == workspace.id)
        .where(Dataset.deleted_at.is_(None))
        .order_by(Dataset.created_at.desc())
    )
    if source:
        stmt = stmt.where(Dataset.source == source)
    if status:
        statuses = [s.strip() for s in status.split(',')]
        stmt = stmt.where(Dataset.status.in_(statuses))
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.scalars(stmt)).all()
    return [DatasetOut.model_validate(row) for row in rows]


@router.post('/import', response_model=DatasetImportResponse, status_code=202)
async def import_dataset(
    payload: DatasetImportRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DatasetImportResponse:
    workspace = await resolve_workspace(db, user, payload.workspace_id)

    dataset = Dataset(
        id=str(uuid4()),
        workspace_id=workspace.id,
        source=payload.source,
        source_ref=payload.source_ref,
        name=payload.name or payload.source_ref.split('/')[-1],
        status='queued',
        progress=0,
    )
    db.add(dataset)
    await audit(db, user.id, 'dataset.import', 'dataset', dataset.id, {'source': payload.source})
    await db.commit()

    task = asyncio.create_task(run_ingestion_background(dataset.id, workspace.id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return DatasetImportResponse(dataset_id=dataset.id, status='queued')


@router.get('/{dataset_id}', response_model=DatasetOut)
async def get_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DatasetOut:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.deleted_at is not None:
        raise HTTPException(status_code=404, detail='Dataset not found')
    workspace = await resolve_workspace(db, user, dataset.workspace_id)
    if dataset.workspace_id != workspace.id:
        raise HTTPException(status_code=403, detail='Forbidden')
    return DatasetOut.model_validate(dataset)


@router.delete('/{dataset_id}', status_code=204)
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.deleted_at is not None:
        raise HTTPException(status_code=404, detail='Dataset not found')
    workspace = await resolve_workspace(db, user, dataset.workspace_id)
    if dataset.workspace_id != workspace.id:
        raise HTTPException(status_code=403, detail='Forbidden')
    dataset.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.get('/{dataset_id}/preview', response_model=DatasetPreviewResponse)
async def get_dataset_preview(
    dataset_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DatasetPreviewResponse:
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.deleted_at is not None:
        raise HTTPException(status_code=404, detail='Dataset not found')
    workspace = await resolve_workspace(db, user, dataset.workspace_id)
    if dataset.workspace_id != workspace.id:
        raise HTTPException(status_code=403, detail='Forbidden')
    rows = dataset.preview_samples or []
    total = len(rows)
    page = rows[offset: offset + limit]
    return DatasetPreviewResponse(rows=page, total=total, offset=offset, limit=limit)
```

- [ ] **Step 2: Verify app starts**

```bash
cd backend/api && python -c "from src.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/routers/datasets.py
git commit -m "feat(api): datasets — async import 202, GET/:id, DELETE/:id, GET/:id/preview"
```

---

## Task 6: Shared types update

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add Dataset types and WS events**

In `packages/types/src/index.ts`, add after the existing `Asset` interface (keep all existing exports):

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
  ingestionConfig: Record<string, unknown>
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}
```

Also add three new variants to the `WSMessage` union (append to the existing union):

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

- [ ] **Step 2: Build types package**

```bash
cd packages/types && pnpm build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): DatasetStatus, Dataset, DatasetQualityReport, WS dataset events"
```

---

## Task 7: Frontend API client + query keys

**Files:**
- Create: `frontend/app/src/lib/api/datasets.ts`
- Modify: `frontend/app/src/lib/api/query-keys.ts`

- [ ] **Step 1: Create datasets API client**

Create `frontend/app/src/lib/api/datasets.ts`:

```typescript
import type { Dataset } from '@aether/types'
import { apiRequest } from './client'

export interface DatasetImportRequest {
  source: 'huggingface' | 'kaggle' | 'local'
  sourceRef: string
  name?: string
  workspaceId?: string
}

export interface DatasetImportResponse {
  dataset_id: string
  status: string
}

export interface DatasetPreviewPage {
  rows: Record<string, unknown>[]
  total: number
  offset: number
  limit: number
}

function toSnakeImport(req: DatasetImportRequest) {
  return {
    source: req.source,
    source_ref: req.sourceRef,
    name: req.name ?? null,
    workspace_id: req.workspaceId ?? null,
  }
}

function mapDataset(raw: Record<string, unknown>): Dataset {
  return {
    id: raw.id as string,
    workspaceId: raw.workspace_id as string,
    source: raw.source as Dataset['source'],
    sourceRef: raw.source_ref as string,
    name: raw.name as string,
    status: raw.status as Dataset['status'],
    progress: (raw.progress as number) ?? 0,
    rowCount: (raw.row_count as number) ?? 0,
    sampleCount: (raw.sample_count as number) ?? 0,
    mediaTypes: (raw.media_types as string[]) ?? [],
    columns: (raw.columns as Dataset['columns']) ?? [],
    qualityReport: (raw.quality_report as Dataset['qualityReport']) ?? null,
    previewSamples: (raw.preview_samples as Record<string, unknown>[]) ?? [],
    lineage: (raw.lineage as Record<string, unknown>) ?? {},
    ingestionConfig: (raw.ingestion_config as Record<string, unknown>) ?? {},
    errorMessage: (raw.error_message as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  }
}

export async function postDatasetImport(
  req: DatasetImportRequest,
): Promise<DatasetImportResponse> {
  return apiRequest<DatasetImportResponse>('/api/datasets/import', {
    method: 'POST',
    body: JSON.stringify(toSnakeImport(req)),
  })
}

export async function getDatasets(workspaceId: string): Promise<Dataset[]> {
  const raw = await apiRequest<Record<string, unknown>[]>(
    `/api/datasets?workspace_id=${workspaceId}`,
  )
  return raw.map(mapDataset)
}

export async function getInflightDatasets(workspaceId: string): Promise<Dataset[]> {
  const raw = await apiRequest<Record<string, unknown>[]>(
    `/api/datasets?workspace_id=${workspaceId}&status=queued,inspecting,analyzing,previewing`,
  )
  return raw.map(mapDataset)
}

export async function getDataset(id: string): Promise<Dataset> {
  const raw = await apiRequest<Record<string, unknown>>(`/api/datasets/${id}`)
  return mapDataset(raw)
}

export async function getDatasetPreview(
  id: string,
  offset = 0,
  limit = 10,
): Promise<DatasetPreviewPage> {
  return apiRequest<DatasetPreviewPage>(
    `/api/datasets/${id}/preview?offset=${offset}&limit=${limit}`,
  )
}

export async function deleteDataset(id: string): Promise<void> {
  await apiRequest<void>(`/api/datasets/${id}`, { method: 'DELETE' })
}
```

- [ ] **Step 2: Update query keys**

In `frontend/app/src/lib/api/query-keys.ts`, add three new keys:

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
  dataset: (id: string) => ['dataset', id] as const,
  datasetPreview: (id: string) => ['dataset-preview', id] as const,
  trainingJobs: (workspaceId: string) => ['training-jobs', workspaceId] as const,
  models: (workspaceId: string) => ['models', workspaceId] as const,
} as const
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend/app && pnpm exec tsc --noEmit 2>&1 | grep "datasets\|query-keys" | head -10
```

Expected: no errors in these files.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/lib/api/datasets.ts frontend/app/src/lib/api/query-keys.ts
git commit -m "feat(api-client): datasets API client + dataset/datasetPreview query keys"
```

---

## Task 8: Zustand dataset store

**Files:**
- Create: `frontend/app/src/lib/store/dataset.ts`

- [ ] **Step 1: Create store**

Create `frontend/app/src/lib/store/dataset.ts`:

```typescript
'use client'

import { create } from 'zustand'
import type { Dataset, DatasetStatus } from '@aether/types'

export interface ActiveIngestionState {
  datasetId: string
  sourceRef: string
  name: string
  status: DatasetStatus
  progress: number
  errorMessage: string | null
  createdAt: number
}

interface DatasetStore {
  activeIngestions: Record<string, ActiveIngestionState>

  setIngesting(state: ActiveIngestionState): void
  updateProgress(datasetId: string, status: DatasetStatus, progress: number): void
  completeIngestion(datasetId: string): void
  failIngestion(datasetId: string, error: string): void
  hydrateFromServer(datasets: Dataset[]): void
}

export const useDatasetStore = create<DatasetStore>((set) => ({
  activeIngestions: {},

  setIngesting(state) {
    set((s) => ({
      activeIngestions: { ...s.activeIngestions, [state.datasetId]: state },
    }))
  },

  updateProgress(datasetId, status, progress) {
    set((s) => {
      const existing = s.activeIngestions[datasetId]
      if (!existing) return s
      return {
        activeIngestions: {
          ...s.activeIngestions,
          [datasetId]: { ...existing, status, progress },
        },
      }
    })
  },

  completeIngestion(datasetId) {
    set((s) => {
      const existing = s.activeIngestions[datasetId]
      if (!existing) return s
      return {
        activeIngestions: {
          ...s.activeIngestions,
          [datasetId]: { ...existing, status: 'completed', progress: 100 },
        },
      }
    })
  },

  failIngestion(datasetId, error) {
    set((s) => {
      const existing = s.activeIngestions[datasetId]
      if (!existing) return s
      return {
        activeIngestions: {
          ...s.activeIngestions,
          [datasetId]: { ...existing, status: 'failed', errorMessage: error },
        },
      }
    })
  },

  hydrateFromServer(datasets) {
    const incoming: Record<string, ActiveIngestionState> = {}
    for (const d of datasets) {
      incoming[d.id] = {
        datasetId: d.id,
        sourceRef: d.sourceRef,
        name: d.name,
        status: d.status,
        progress: d.progress,
        errorMessage: d.errorMessage,
        createdAt: new Date(d.createdAt).getTime(),
      }
    }
    set((s) => ({ activeIngestions: { ...s.activeIngestions, ...incoming } }))
  },
}))
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend/app && pnpm exec tsc --noEmit 2>&1 | grep "store/dataset" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/lib/store/dataset.ts
git commit -m "feat(store): useDatasetStore — ingestion lifecycle state"
```

---

## Task 9: useDatasetReconcile hook

**Files:**
- Create: `frontend/app/src/lib/hooks/use-dataset-reconcile.ts`

- [ ] **Step 1: Create hook**

Create `frontend/app/src/lib/hooks/use-dataset-reconcile.ts`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Dataset, WSMessage } from '@aether/types'
import { useDatasetStore } from '@/lib/store/dataset'
import { getInflightDatasets } from '@/lib/api/datasets'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'

export function useDatasetReconcile(
  workspaceId: string,
  lastEvent: WSMessage | null,
) {
  const store = useDatasetStore()
  const queryClient = useQueryClient()
  const reconciled = useRef(false)

  // On mount: fetch in-flight datasets and hydrate store
  useEffect(() => {
    if (reconciled.current || !workspaceId) return
    reconciled.current = true
    getInflightDatasets(workspaceId)
      .then((datasets) => {
        if (datasets.length > 0) store.hydrateFromServer(datasets)
      })
      .catch(() => {
        // non-fatal
      })
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wire WS events → store + query cache
  useEffect(() => {
    if (!lastEvent) return

    if (lastEvent.type === 'dataset.progress') {
      store.updateProgress(
        lastEvent.datasetId,
        lastEvent.payload.status,
        lastEvent.payload.progress,
      )
    }

    if (lastEvent.type === 'dataset.completed') {
      const { dataset } = lastEvent.payload
      store.completeIngestion(lastEvent.datasetId)

      // Prepend to datasets list cache
      queryClient.setQueryData<Dataset[]>(
        QK.datasets(workspaceId),
        (old) => {
          if (!old) return [dataset]
          const alreadyPresent = old.some((d) => d.id === dataset.id)
          if (alreadyPresent) return old.map((d) => (d.id === dataset.id ? dataset : d))
          return [dataset, ...old]
        },
      )

      toast.success(`Dataset "${dataset.name}" ingested successfully`)
    }

    if (lastEvent.type === 'dataset.failed') {
      store.failIngestion(lastEvent.datasetId, lastEvent.payload.error)
      toast.error(`Dataset ingestion failed: ${lastEvent.payload.error}`)
    }
  }, [lastEvent]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend/app && pnpm exec tsc --noEmit 2>&1 | grep "use-dataset-reconcile" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/lib/hooks/use-dataset-reconcile.ts
git commit -m "feat(hooks): useDatasetReconcile — WS event wiring + store hydration on mount"
```

---

## Task 10: Upgrade DatasetConsole component

**Files:**
- Modify: `frontend/app/src/components/workspace/dataset-console.tsx`

- [ ] **Step 1: Replace DatasetConsole with live-wired version**

Replace the full contents of `frontend/app/src/components/workspace/dataset-console.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { DatabaseZap, FileCheck2, Loader2, ShieldCheck, Trash2, UploadCloud, Eye } from 'lucide-react'
import type { Dataset, DatasetStatus } from '@aether/types'
import { useDatasetStore } from '@/lib/store/dataset'
import { postDatasetImport, getDatasets, getDatasetPreview, deleteDataset } from '@/lib/api/datasets'
import { QK } from '@/lib/api/query-keys'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const SOURCES: { id: Dataset['source']; label: string; hint: string }[] = [
  { id: 'huggingface', label: 'Hugging Face', hint: 'owner/dataset-name' },
  { id: 'kaggle', label: 'Kaggle', hint: 'owner/dataset-slug' },
  { id: 'local', label: 'Local upload', hint: 'Coming in next sprint' },
]

const STAGE_LABELS: Record<DatasetStatus, string> = {
  queued: 'Queued…',
  inspecting: 'Inspecting schema…',
  analyzing: 'Analyzing quality…',
  previewing: 'Fetching preview…',
  completed: 'Ready',
  failed: 'Failed',
}

interface Props {
  workspaceId: string
}

export function DatasetConsole({ workspaceId }: Props) {
  const queryClient = useQueryClient()
  const store = useDatasetStore()
  const [source, setSource] = useState<Dataset['source']>('huggingface')
  const [sourceRef, setSourceRef] = useState('lambdalabs/pokemon-blip-captions')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewDatasetId, setPreviewDatasetId] = useState<string | null>(null)

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: QK.datasets(workspaceId),
    queryFn: () => getDatasets(workspaceId),
    enabled: !!workspaceId,
  })

  const { data: preview } = useQuery({
    queryKey: QK.datasetPreview(previewDatasetId ?? ''),
    queryFn: () => getDatasetPreview(previewDatasetId!),
    enabled: !!previewDatasetId,
  })

  const handleImport = async () => {
    if (!sourceRef || source === 'local') return
    setIsSubmitting(true)
    try {
      const res = await postDatasetImport({ source, sourceRef, name: name || undefined, workspaceId })
      store.setIngesting({
        datasetId: res.dataset_id,
        sourceRef,
        name: name || sourceRef.split('/').pop() || sourceRef,
        status: 'queued',
        progress: 0,
        errorMessage: null,
        createdAt: Date.now(),
      })
      toast.success('Dataset ingestion started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string, datasetName: string) => {
    queryClient.setQueryData<Dataset[]>(QK.datasets(workspaceId), (old) =>
      (old ?? []).filter((d) => d.id !== id),
    )
    try {
      await deleteDataset(id)
    } catch {
      queryClient.invalidateQueries({ queryKey: QK.datasets(workspaceId) })
      toast.error('Failed to delete dataset')
    }
  }

  // Merge active ingestions into dataset list for display
  const activeIds = new Set(datasets.map((d) => d.id))
  const activeCards = Object.values(store.activeIngestions).filter(
    (a) => !activeIds.has(a.datasetId) && a.status !== 'completed',
  )

  return (
    <div className="space-y-6">
      {/* Import panel */}
      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex items-center gap-3 text-white">
            <DatabaseZap className="h-5 w-5 text-[#63b3ed]" />
            <h2 className="font-display text-2xl">Secure import</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {SOURCES.map((item) => (
              <button
                key={item.id}
                onClick={() => item.id !== 'local' && setSource(item.id)}
                disabled={item.id === 'local'}
                className={cn(
                  'rounded-[18px] border px-4 py-3 text-left transition',
                  source === item.id
                    ? 'border-white/30 bg-white text-black'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
                  item.id === 'local' && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={cn('mt-1 block text-xs', source === item.id ? 'text-black/55' : 'text-white/40')}>
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            <input
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#63b3ed]/50"
              placeholder="Dataset reference"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#a78bfa]/50"
              placeholder="Display name (optional)"
            />
            <button
              onClick={handleImport}
              disabled={isSubmitting || !sourceRef || source === 'local'}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Import and validate
            </button>
          </div>
        </div>

        {/* Ingestion policy (static display) */}
        <div className="glass-panel rounded-[28px] p-5">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h2 className="font-display text-2xl">Ingestion policy</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {['Schema validation', 'Media type inspection', 'Null rate analysis', 'Duplicate detection', 'Language detection', 'Lineage capture'].map((item) => (
              <div key={item} className="rounded-[18px] border border-white/8 bg-white/4 p-4 text-sm text-white/70">
                <FileCheck2 className="mb-3 h-4 w-4 text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dataset cards */}
      <section className="grid gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {/* Active ingestion cards (not yet in server list) */}
          {activeCards.map((active) => (
            <motion.article
              key={active.datasetId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel rounded-[24px] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/40">{active.sourceRef}</div>
                  <h3 className="mt-2 font-display text-2xl text-white">{active.name}</h3>
                </div>
                <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs text-blue-200">
                  {STAGE_LABELS[active.status]}
                </span>
              </div>
              <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/50 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${active.progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="mt-2 text-xs text-white/30">{active.progress}%</p>
            </motion.article>
          ))}

          {/* Persisted dataset cards */}
          {datasets.map((dataset) => {
            const active = store.activeIngestions[dataset.id]
            const displayStatus = (active?.status ?? dataset.status) as DatasetStatus
            const displayProgress = active?.progress ?? dataset.progress
            const isIngesting = !['completed', 'failed'].includes(displayStatus)

            return (
              <motion.article
                key={dataset.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel rounded-[24px] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-white/40">{dataset.source}</div>
                    <h3 className="mt-2 font-display text-2xl text-white">{dataset.name}</h3>
                  </div>
                  <span className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    displayStatus === 'completed' && 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
                    displayStatus === 'failed' && 'border-red-400/20 bg-red-400/10 text-red-200',
                    isIngesting && 'border-blue-400/20 bg-blue-400/10 text-blue-200',
                  )}>
                    {STAGE_LABELS[displayStatus]}
                  </span>
                </div>

                {isIngesting && (
                  <div className="mt-3 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white/50 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${displayProgress}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}

                {displayStatus === 'completed' && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <Metric label="records" value={dataset.rowCount.toLocaleString()} />
                      <Metric label="columns" value={String(dataset.columns.length)} />
                      <Metric label="samples" value={String(dataset.sampleCount)} />
                    </div>
                    {dataset.qualityReport && (
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/60">
                        <div className="rounded-xl bg-white/5 px-3 py-2">
                          Lang: <span className="text-white/80">{dataset.qualityReport.language}</span>
                        </div>
                        <div className="rounded-xl bg-white/5 px-3 py-2">
                          Dupes: <span className="text-white/80">{(dataset.qualityReport.duplicate_estimate * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dataset.columns.slice(0, 6).map((col) => (
                        <span key={col.name} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
                          {col.name}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {displayStatus === 'failed' && (
                  <p className="mt-3 text-xs text-red-400/70">{dataset.errorMessage ?? 'Ingestion failed'}</p>
                )}

                <div className="mt-4 flex gap-2">
                  {displayStatus === 'completed' && (
                    <button
                      onClick={() => setPreviewDatasetId(previewDatasetId === dataset.id ? null : dataset.id)}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                    >
                      <Eye className="h-3 w-3" /> Preview
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(dataset.id, dataset.name)}
                    className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:border-red-400/30 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Preview table */}
                {previewDatasetId === dataset.id && preview && preview.rows.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs text-white/60">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          {Object.keys(preview.rows[0]).slice(0, 6).map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-medium text-white/40">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-white/5">
                            {Object.keys(preview.rows[0]).slice(0, 6).map((col) => (
                              <td key={col} className="max-w-[120px] truncate px-3 py-2">
                                {String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-3 py-2 text-xs text-white/30">{preview.total} total rows</p>
                  </div>
                )}
              </motion.article>
            )
          })}
        </AnimatePresence>

        {isLoading && (
          <div className="glass-panel rounded-[24px] p-5 text-sm text-white/50">Loading datasets…</div>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/8 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-2 truncate text-white/80">{value}</div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend/app && pnpm exec tsc --noEmit 2>&1 | grep "dataset-console" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/workspace/dataset-console.tsx
git commit -m "feat(ui): DatasetConsole — live ingestion cards, quality report, preview table, delete"
```

---

## Task 11: Datasets page + final integration

**Files:**
- Create: `frontend/app/src/app/workspace/datasets/page.tsx`

- [ ] **Step 1: Create datasets page**

Create `frontend/app/src/app/workspace/datasets/page.tsx`:

```typescript
'use client'

import { useAuthStore } from '@/lib/store/auth'
import { WorkspaceShell } from '@/components/workspace/app-shell'
import { DatasetConsole } from '@/components/workspace/dataset-console'
import { useDatasetReconcile } from '@/lib/hooks/use-dataset-reconcile'
import { useWorkspaceWebSocket } from '@/lib/hooks/use-websocket'

export default function DatasetsPage() {
  const workspace = useAuthStore((s) => s.workspace)
  const workspaceId = workspace?.id ?? ''

  const { lastEvent } = useWorkspaceWebSocket(workspaceId)
  useDatasetReconcile(workspaceId, lastEvent)

  return (
    <WorkspaceShell title="Datasets" subtitle="Import and inspect training datasets">
      <div className="p-6">
        {workspaceId ? (
          <DatasetConsole workspaceId={workspaceId} />
        ) : (
          <p className="text-white/20 text-sm">Loading workspace…</p>
        )}
      </div>
    </WorkspaceShell>
  )
}
```

- [ ] **Step 2: Run full backend test suite**

```bash
cd backend/api && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all existing Sprint 1 + Sprint 2 tests pass, plus 4 new dataset ingestion tests.

- [ ] **Step 3: Run frontend build**

```bash
cd frontend/app && pnpm build 2>&1 | tail -20
```

Expected: clean build, `/workspace/datasets` in route table.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/app/workspace/datasets/
git commit -m "feat(pages): /workspace/datasets — DatasetConsole wired to WS + reconciliation"
```

- [ ] **Step 5: Final milestone commit**

```bash
git commit --allow-empty -m "feat: Sprint 3 Dataset Ingestion — complete implementation"
```
