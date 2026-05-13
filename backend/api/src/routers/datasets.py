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
