from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..dependencies import resolve_workspace
from ..models import Asset, AuditLog, Notification, User
from ..schemas import AssetResponse, NotificationResponse
from ..security import get_current_user, require_role

router = APIRouter()


@router.get('/assets', response_model=list[AssetResponse])
async def list_assets(
    workspace_id: str | None = None,
    kind: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AssetResponse]:
    workspace = await resolve_workspace(db, user, workspace_id)
    query = select(Asset).where(Asset.workspace_id == workspace.id).order_by(Asset.created_at.desc())
    if kind:
        query = query.where(Asset.kind == kind)
    rows = (await db.scalars(query)).all()
    return [AssetResponse.model_validate(row) for row in rows]


@router.get('/notifications', response_model=list[NotificationResponse])
async def list_notifications(
    workspace_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[NotificationResponse]:
    workspace = await resolve_workspace(db, user, workspace_id)
    rows = (await db.scalars(select(Notification).where(Notification.workspace_id == workspace.id).order_by(Notification.created_at.desc()))).all()
    return [NotificationResponse.model_validate(row) for row in rows]


@router.get('/admin/audit')
async def audit_logs(
    _: User = Depends(require_role('owner', 'admin')),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100))).all()
    return [
        {
            'id': row.id,
            'user_id': row.user_id,
            'action': row.action,
            'target_type': row.target_type,
            'target_id': row.target_id,
            'metadata': row.metadata_json,
            'created_at': row.created_at,
        }
        for row in rows
    ]
