from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..dependencies import resolve_workspace
from ..models import ModelRegistryEntry, User
from ..schemas import ModelRegistryResponse
from ..security import audit, get_current_user

router = APIRouter()


@router.get('', response_model=list[ModelRegistryResponse])
async def list_models(
    workspace_id: str | None = None,
    deployment_status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ModelRegistryResponse]:
    workspace = await resolve_workspace(db, user, workspace_id)
    query = select(ModelRegistryEntry).where(ModelRegistryEntry.workspace_id == workspace.id).order_by(ModelRegistryEntry.created_at.desc())
    if deployment_status:
        query = query.where(ModelRegistryEntry.deployment_status == deployment_status)
    rows = (await db.scalars(query)).all()
    return [ModelRegistryResponse.model_validate(row) for row in rows]


@router.post('/{model_id}/promote', response_model=ModelRegistryResponse)
async def promote_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ModelRegistryResponse:
    entry = await db.get(ModelRegistryEntry, model_id)
    if not entry:
        raise HTTPException(status_code=404, detail='Model not found')
    await resolve_workspace(db, user, entry.workspace_id)
    entry.deployment_status = 'production'
    await audit(db, user.id, 'model.promote', 'model_registry', entry.id)
    await db.commit()
    await db.refresh(entry)
    return ModelRegistryResponse.model_validate(entry)


@router.post('/{model_id}/rollback', response_model=ModelRegistryResponse)
async def rollback_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ModelRegistryResponse:
    entry = await db.get(ModelRegistryEntry, model_id)
    if not entry:
        raise HTTPException(status_code=404, detail='Model not found')
    await resolve_workspace(db, user, entry.workspace_id)
    entry.deployment_status = 'rolled_back'
    await audit(db, user.id, 'model.rollback', 'model_registry', entry.id)
    await db.commit()
    await db.refresh(entry)
    return ModelRegistryResponse.model_validate(entry)
