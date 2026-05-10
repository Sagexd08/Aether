from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dataset_connectors import inspect_huggingface_dataset, inspect_kaggle_dataset, inspect_local_upload
from ..db import get_db
from ..dependencies import resolve_workspace
from ..models import Dataset, User
from ..schemas import DatasetImportRequest, DatasetResponse
from ..security import audit, get_current_user

router = APIRouter()


@router.get('', response_model=list[DatasetResponse])
async def list_datasets(
    workspace_id: str | None = None,
    source: str | None = Query(default=None),
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DatasetResponse]:
    workspace = await resolve_workspace(db, user, workspace_id)
    query = select(Dataset).where(Dataset.workspace_id == workspace.id).order_by(Dataset.created_at.desc()).limit(limit).offset(offset)
    if source:
        query = query.where(Dataset.source == source)
    rows = (await db.scalars(query)).all()
    return [DatasetResponse.model_validate(row) for row in rows]


@router.post('/import', response_model=DatasetResponse)
async def import_dataset(
    payload: DatasetImportRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DatasetResponse:
    workspace = await resolve_workspace(db, user, payload.workspace_id)
    if payload.source == 'huggingface':
        inspection = await inspect_huggingface_dataset(payload.source_ref)
    elif payload.source == 'kaggle':
        inspection = await inspect_kaggle_dataset(payload.source_ref)
    else:
        inspection = inspect_local_upload(payload.name or payload.source_ref)

    dataset = Dataset(
        id=str(uuid4()),
        workspace_id=workspace.id,
        source=payload.source,
        source_ref=payload.source_ref,
        name=payload.name or payload.source_ref.split('/')[-1],
        status='validated' if inspection.columns else 'needs_schema',
        row_count=inspection.row_count,
        media_types=inspection.media_types,
        columns=inspection.columns,
        quality_report=inspection.quality_report,
        lineage=inspection.lineage,
        preview_samples=inspection.preview_samples,
    )
    db.add(dataset)
    await audit(db, user.id, 'dataset.import', 'dataset', dataset.id, {'source': payload.source})
    await db.commit()
    await db.refresh(dataset)
    return DatasetResponse.model_validate(dataset)
