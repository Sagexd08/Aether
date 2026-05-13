import base64
from dataclasses import dataclass, field
from typing import Any

import httpx
from fastapi import HTTPException

from .config import get_settings


@dataclass
class ConnectorResult:
    row_count: int
    media_types: list[str]
    columns: list[dict[str, Any]]
    sample_rows: list[dict[str, Any]] = field(default_factory=list)
    lineage_extra: dict[str, Any] = field(default_factory=dict)


def _guess_media_types(features: dict[str, Any]) -> list[str]:
    media_types: set[str] = set()
    for value in features.values():
        text = str(value).lower()
        if 'image' in text:
            media_types.add('image')
        if 'audio' in text:
            media_types.add('audio')
        if 'video' in text:
            media_types.add('video')
        if any(marker in text for marker in ('string', 'text', 'caption')):
            media_types.add('text')
    return sorted(media_types or {'text'})


async def inspect_huggingface_dataset(dataset_id: str, num_samples: int = 50) -> ConnectorResult:
    settings = get_settings()
    headers = {'Authorization': f'Bearer {settings.huggingface_token}'} if settings.huggingface_token else {}

    async with httpx.AsyncClient(timeout=30) as client:
        meta_resp = await client.get(
            f'https://huggingface.co/api/datasets/{dataset_id}',
            headers=headers,
        )
    if meta_resp.status_code == 404:
        raise HTTPException(status_code=404, detail='HuggingFace dataset not found')
    meta_resp.raise_for_status()
    payload = meta_resp.json()

    dataset_info = payload.get('datasetInfo') or {}
    card_data = payload.get('cardData') or {}
    features = dataset_info.get('features') or card_data.get('features') or {}
    columns = [{'name': key, 'dtype': str(value), 'nullable': True} for key, value in features.items()]
    row_count = dataset_info.get('num_examples') or int(payload.get('downloads') or 0)

    # Fetch sample rows via HF datasets-server API (best-effort)
    sample_rows: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            rows_resp = await client.get(
                'https://datasets-server.huggingface.co/rows',
                params={'dataset': dataset_id, 'split': 'train', 'offset': 0, 'length': num_samples},
                headers=headers,
            )
        if rows_resp.status_code == 200:
            rows_data = rows_resp.json()
            sample_rows = [r.get('row', r) for r in rows_data.get('rows', [])]
    except Exception:
        pass  # sample rows are best-effort

    return ConnectorResult(
        row_count=row_count,
        media_types=_guess_media_types(features),
        columns=columns,
        sample_rows=sample_rows[:num_samples],
        lineage_extra={'revision': payload.get('sha'), 'hf_dataset_id': dataset_id},
    )


async def inspect_kaggle_dataset(dataset_ref: str, num_samples: int = 50) -> ConnectorResult:
    settings = get_settings()
    if not settings.kaggle_username or not settings.kaggle_key:
        raise HTTPException(status_code=503, detail='Kaggle connector is not configured')
    token = base64.b64encode(f'{settings.kaggle_username}:{settings.kaggle_key}'.encode()).decode()
    headers = {'Authorization': f'Basic {token}'}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f'https://www.kaggle.com/api/v1/datasets/view/{dataset_ref}',
            headers=headers,
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail='Kaggle dataset not found')
    resp.raise_for_status()
    payload = resp.json()

    files = payload.get('files') or []
    columns = [
        {'name': f.get('name', 'file'), 'dtype': f.get('type', 'file'), 'nullable': False}
        for f in files[:40]
    ]
    media_types = sorted({
        'image' if str(f.get('name', '')).lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) else 'text'
        for f in files
    } or {'text'})

    sample_rows = [
        {'file': f.get('name'), 'size_bytes': f.get('totalBytes'), 'type': f.get('type')}
        for f in files[:num_samples]
    ]

    return ConnectorResult(
        row_count=int(payload.get('totalBytes') or 0),
        media_types=media_types,
        columns=columns,
        sample_rows=sample_rows,
        lineage_extra={
            'kaggle_ref': dataset_ref,
            'version': payload.get('currentVersionNumber'),
            'file_count': len(files),
        },
    )


def inspect_local_upload(name: str) -> ConnectorResult:
    """Stub — local upload not supported in Sprint 3."""
    return ConnectorResult(
        row_count=0,
        media_types=['text'],
        columns=[{'name': 'pending_upload', 'dtype': 'file', 'nullable': False}],
        sample_rows=[],
        lineage_extra={'source': 'local', 'name': name},
    )
