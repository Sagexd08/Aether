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
                language_confidence = 0.9
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
