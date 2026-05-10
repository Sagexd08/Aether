from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User, Workspace


async def resolve_workspace(db: AsyncSession, user: User, workspace_id: str | None = None) -> Workspace:
    query = select(Workspace).where(Workspace.owner_id == user.id)
    if workspace_id:
        query = query.where(Workspace.id == workspace_id)
    workspace = await db.scalar(query)
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    return workspace
