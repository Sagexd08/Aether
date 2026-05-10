from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Project, User, Workspace
from ..schemas import ProjectCreate, ProjectResponse, WorkspaceResponse
from ..security import audit, get_current_user
from uuid import uuid4

router = APIRouter()


@router.get('', response_model=list[WorkspaceResponse])
async def list_workspaces(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[WorkspaceResponse]:
    rows = (await db.scalars(select(Workspace).where(Workspace.owner_id == user.id))).all()
    return [WorkspaceResponse.model_validate(row) for row in rows]


@router.get('/{workspace_id}/projects', response_model=list[ProjectResponse])
async def list_projects(workspace_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[ProjectResponse]:
    workspace = await db.get(Workspace, workspace_id)
    if not workspace or workspace.owner_id != user.id:
        return []
    rows = (await db.scalars(select(Project).where(Project.workspace_id == workspace_id).order_by(Project.created_at.desc()))).all()
    return [ProjectResponse.model_validate(row) for row in rows]


@router.post('/{workspace_id}/projects', response_model=ProjectResponse)
async def create_project(
    workspace_id: str,
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectResponse:
    workspace = await db.get(Workspace, workspace_id)
    if not workspace or workspace.owner_id != user.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail='Workspace not found')
    project = Project(id=str(uuid4()), workspace_id=workspace.id, name=payload.name, description=payload.description, mode=payload.mode)
    db.add(project)
    await audit(db, user.id, 'project.create', 'project', project.id)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)
