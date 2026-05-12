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
            asset=job.assets[0],
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
        asset=asset,
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
