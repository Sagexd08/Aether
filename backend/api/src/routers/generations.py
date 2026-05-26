import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Asset, GenerationJob
from ..realtime import _get_redis
from ..schemas import (
    AsyncGenerateRequest, AsyncGenerateResponse,
    FavoriteResponse, GenerationJobOut, ImageGenerateRequest,
    ImageGenerateResponse, JobsPageResponse,
)
from ..routers.session import get_session_from_id, GENERATION_LIMIT
from ..services.generation import create_job, run_job

router = APIRouter()

_log = logging.getLogger(__name__)

_background_tasks: set[asyncio.Task] = set()

INFLIGHT = {'queued', 'preprocessing', 'running', 'postprocessing', 'persisting'}


async def _run_job_background(session_id: str, job_id: str) -> None:
    """Run a generation job in a background session. Called via asyncio.create_task."""
    from ..db import SessionLocal
    async with SessionLocal() as bg_db:
        bg_session = await get_session_from_id(session_id, bg_db)
        bg_job = await bg_db.get(GenerationJob, job_id)
        if not bg_session or not bg_job:
            return
        redis = await _get_redis()
        try:
            await run_job(bg_db, redis, bg_job, bg_session)
        except Exception:
            _log.exception('Background generation job %s failed', job_id)
        finally:
            await redis.aclose()


@router.post('/image', response_model=ImageGenerateResponse, status_code=200)
async def generate_image(
    payload: ImageGenerateRequest,
    session_id: str = Header(..., alias='X-Session-Id'),
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    db: AsyncSession = Depends(get_db),
) -> ImageGenerateResponse:
    session = await get_session_from_id(session_id, db)
    
    if session.generations_used >= GENERATION_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                'error': 'generation_limit_reached',
                'remaining': 0
            }
        )

    ik = payload.idempotency_key or idempotency_key

    job = await create_job(
        db, session, 'image', payload.prompt,
        negative_prompt=payload.negative_prompt,
        model=payload.model,
        seed=payload.seed,
        metadata=payload.metadata,
        idempotency_key=ik,
    )

    # Check idempotency — job already completed
    if job.status == 'completed' and job.assets:
        return ImageGenerateResponse(
            job=GenerationJobOut.model_validate(job),
            asset=job.assets[0],
        )

    redis = await _get_redis()
    try:
        asset = await run_job(db, redis, job, session)
    finally:
        await redis.aclose()

    if not asset:
        raise HTTPException(status_code=502, detail=job.error_message or 'Generation failed')

    await db.commit()

    return ImageGenerateResponse(
        job=GenerationJobOut.model_validate(job),
        asset=asset,
    )


@router.post('/video', response_model=AsyncGenerateResponse, status_code=202)
async def generate_video(
    payload: AsyncGenerateRequest,
    session_id: str = Header(..., alias='X-Session-Id'),
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerateResponse:
    session = await get_session_from_id(session_id, db)
    
    if session.generations_used >= GENERATION_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                'error': 'generation_limit_reached',
                'remaining': 0
            }
        )

    ik = payload.idempotency_key or idempotency_key

    job = await create_job(
        db, session, 'video', payload.prompt,
        negative_prompt=payload.negative_prompt,
        model=payload.model or 'Wan-AI/Wan2.1-T2V-1.3B',
        seed=payload.seed,
        metadata=payload.metadata,
        idempotency_key=ik,
    )

    await db.commit()

    # Only spawn background task for newly queued jobs
    if job.status == 'queued':
        task = asyncio.create_task(_run_job_background(session.session_id, job.id))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

    return AsyncGenerateResponse(job_id=job.id, status=job.status)


@router.post('/audio', response_model=AsyncGenerateResponse, status_code=202)
async def generate_audio(
    payload: AsyncGenerateRequest,
    session_id: str = Header(..., alias='X-Session-Id'),
    idempotency_key: str | None = Header(default=None, alias='Idempotency-Key'),
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerateResponse:
    session = await get_session_from_id(session_id, db)
    
    if session.generations_used >= GENERATION_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                'error': 'generation_limit_reached',
                'remaining': 0
            }
        )

    ik = payload.idempotency_key or idempotency_key

    job = await create_job(
        db, session, 'audio', payload.prompt,
        negative_prompt=payload.negative_prompt,
        model=payload.model or 'facebook/musicgen-small',
        seed=payload.seed,
        metadata=payload.metadata,
        idempotency_key=ik,
    )

    await db.commit()

    # Only spawn background task for newly queued jobs
    if job.status == 'queued':
        task = asyncio.create_task(_run_job_background(session.session_id, job.id))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

    return AsyncGenerateResponse(job_id=job.id, status=job.status)


@router.get('/jobs', response_model=JobsPageResponse)
async def list_jobs(
    session_id: str = Header(..., alias='X-Session-Id'),
    mode: str | None = Query(default=None),
    status: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
) -> JobsPageResponse:
    session = await get_session_from_id(session_id, db)

    stmt = (
        select(GenerationJob)
        .where(GenerationJob.session_id == session.session_id)
        .where(GenerationJob.deleted_at.is_(None))
        .order_by(GenerationJob.created_at.desc(), GenerationJob.id.desc())
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
            try:
                cur_ts = datetime.fromisoformat(parts[0])
                cur_id = parts[1]
                stmt = stmt.where(
                    (GenerationJob.created_at < cur_ts) |
                    ((GenerationJob.created_at == cur_ts) & (GenerationJob.id < cur_id))
                )
            except ValueError:
                pass
    stmt = stmt.limit(limit + 1)

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
    session_id: str = Header(..., alias='X-Session-Id'),
    db: AsyncSession = Depends(get_db),
) -> GenerationJobOut:
    session = await get_session_from_id(session_id, db)
    job = await db.get(GenerationJob, job_id)
    if not job or job.deleted_at is not None or job.session_id != session.session_id:
        raise HTTPException(status_code=404, detail='Job not found')
    return GenerationJobOut.model_validate(job)


@router.delete('/jobs/{job_id}', status_code=204)
async def delete_job(
    job_id: str,
    session_id: str = Header(..., alias='X-Session-Id'),
    db: AsyncSession = Depends(get_db),
) -> None:
    session = await get_session_from_id(session_id, db)
    job = await db.get(GenerationJob, job_id)
    if not job or job.deleted_at is not None or job.session_id != session.session_id:
        raise HTTPException(status_code=404, detail='Job not found')

    if job.status in INFLIGHT:
        job.cancel_requested = True
    else:
        job.deleted_at = datetime.now(tz=timezone.utc)
        for asset in job.assets:
            asset.deleted_at = datetime.now(tz=timezone.utc)

    await db.commit()


@router.patch('/assets/{asset_id}/favorite', response_model=FavoriteResponse)
async def toggle_favorite(
    asset_id: str,
    session_id: str = Header(..., alias='X-Session-Id'),
    db: AsyncSession = Depends(get_db),
) -> FavoriteResponse:
    session = await get_session_from_id(session_id, db)
    asset = await db.get(Asset, asset_id)
    if not asset or asset.deleted_at is not None or asset.session_id != session.session_id:
        raise HTTPException(status_code=404, detail='Asset not found')
    asset.is_favorite = not asset.is_favorite
    await db.commit()
    return FavoriteResponse(is_favorite=asset.is_favorite)
