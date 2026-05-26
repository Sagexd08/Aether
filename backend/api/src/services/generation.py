import json
import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import GenerationJob, Asset, Session as DBSession
from ..schemas import GenerationJobOut, AssetOut
from .inference import HuggingFaceProvider, CREDIT_COSTS, DEFAULT_MODELS, ProviderUpdate

_provider = HuggingFaceProvider()


async def _publish(redis, session_id: str, event: dict) -> None:
    await redis.publish(f'ws:session:{session_id}', json.dumps(event))


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
    # Don't publish progress events for terminal states — they have dedicated event types
    if status not in ('completed', 'failed', 'cancelled'):
        await _publish(redis, job.session_id, {
            'type': 'generation.progress',
            'jobId': job.id,
            'sessionId': job.session_id,
            'ts': int(time.time() * 1000),
            'payload': {'status': status, 'progress': progress},
        })


async def create_job(
    db: AsyncSession,
    session: DBSession,
    mode: str,
    prompt: str,
    *,
    negative_prompt: str | None = None,
    model: str | None = None,
    seed: int | None = None,
    metadata: dict | None = None,
    idempotency_key: str | None = None,
) -> GenerationJob:
    """Create a job and check generation limit."""
    # Idempotency check
    if idempotency_key:
        existing = await db.scalar(
            select(GenerationJob).where(GenerationJob.idempotency_key == idempotency_key)
        )
        if existing:
            return existing

    job = GenerationJob(
        id=str(uuid4()),
        session_id=session.session_id,
        mode=mode,
        prompt=prompt,
        negative_prompt=negative_prompt,
        model=model or DEFAULT_MODELS.get(mode, ''),
        provider='huggingface',
        seed=seed,
        metadata_json=metadata or {},
        idempotency_key=idempotency_key,
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
    session: DBSession,
) -> Asset | None:
    """Drive job through full lifecycle. Returns Asset on success, None on failure/cancel."""
    queue_start = time.time()

    try:
        async for update in _provider.generate(job):
            if job.cancel_requested and update.status not in ('completed', 'failed', 'cancelled'):
                await _transition(db, redis, job, 'cancelled', job.progress)
                await db.commit()
                return None

            if update.status == 'failed':
                await _transition(
                    db, redis, job, 'failed', job.progress,
                    error_message=update.error_message,
                    error_code=update.error_code,
                )
                await db.commit()
                await _publish(redis, job.session_id, {
                    'type': 'generation.failed',
                    'jobId': job.id,
                    'sessionId': job.session_id,
                    'ts': int(time.time() * 1000),
                    'payload': {'error': update.error_message or 'Unknown error', 'errorCode': update.error_code},
                })
                return None

            if update.status == 'cancelled':
                await _transition(db, redis, job, 'cancelled', job.progress)
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
                    session_id=job.session_id,
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

                session.generations_used += 1

                await _transition(db, redis, job, 'completed', 100)
                await db.flush()

                job_out = GenerationJobOut.model_validate(job)
                asset_out = AssetOut.model_validate(asset)

                await db.commit()

                await _publish(redis, job.session_id, {
                    'type': 'generation.completed',
                    'jobId': job.id,
                    'sessionId': job.session_id,
                    'ts': int(time.time() * 1000),
                    'payload': {
                        'job': job_out.model_dump(mode='json', by_alias=True),
                        'assets': [asset_out.model_dump(mode='json', by_alias=True)],
                    },
                })
                return asset

            # Intermediate progress update
            await _transition(db, redis, job, update.status, update.progress)

    except Exception as exc:
        try:
            await _transition(
                db, redis, job, 'failed', job.progress,
                error_message=str(exc), error_code='internal_error',
            )
            await db.commit()
        except Exception:
            pass  # best-effort cleanup; don't mask the original exception
        raise

    return None
