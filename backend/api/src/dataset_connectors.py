import base64
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException

from .config import get_settings


@dataclass
class DatasetInspection:
    row_count: int
    media_types: list[str]
    columns: list[dict[str, Any]]
    quality_report: dict[str, Any]
    lineage: dict[str, Any]
    preview_samples: list[dict[str, Any]]


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


async def inspect_huggingface_dataset(dataset_id: str) -> DatasetInspection:
    settings = get_settings()
    headers = {'Authorization': f'Bearer {settings.huggingface_token}'} if settings.huggingface_token else {}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f'https://huggingface.co/api/datasets/{dataset_id}', headers=headers)
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail='Hugging Face dataset not found')
    response.raise_for_status()
    payload = response.json()
    card_data = payload.get('cardData') or {}
    features = {}
    for config in payload.get('siblings') or []:
        if isinstance(config, dict) and config.get('rfilename', '').endswith(('dataset_infos.json', 'README.md')):
            continue
    dataset_info = payload.get('datasetInfo') or {}
    features = dataset_info.get('features') or card_data.get('features') or {}
    columns = [{'name': key, 'dtype': str(value), 'nullable': True} for key, value in features.items()]
    downloads = int(payload.get('downloads') or 0)
    row_count = dataset_info.get('num_examples')
    if not isinstance(row_count, int):
        row_count = downloads
    return DatasetInspection(
        row_count=row_count,
        media_types=_guess_media_types(features),
        columns=columns,
        quality_report={
            'deduplication': 'scheduled',
            'caption_coverage': 'pending_inspection',
            'low_quality_filter': 'enabled',
            'schema_valid': bool(columns),
        },
        lineage={'source': 'huggingface', 'dataset_id': dataset_id, 'revision': payload.get('sha')},
        preview_samples=[],
    )


async def inspect_kaggle_dataset(dataset_ref: str) -> DatasetInspection:
    settings = get_settings()
    if not settings.kaggle_username or not settings.kaggle_key:
        raise HTTPException(status_code=503, detail='Kaggle connector is not configured')
    token = base64.b64encode(f'{settings.kaggle_username}:{settings.kaggle_key}'.encode()).decode()
    headers = {'Authorization': f'Basic {token}'}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f'https://www.kaggle.com/api/v1/datasets/view/{dataset_ref}', headers=headers)
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail='Kaggle dataset not found')
    response.raise_for_status()
    payload = response.json()
    files = payload.get('files') or []
    columns = [{'name': file.get('name', 'file'), 'dtype': file.get('type', 'file'), 'nullable': False} for file in files[:40]]
    media_types = sorted(
        {
            'image' if str(file.get('name', '')).lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) else 'text'
            for file in files
        }
        or {'text'}
    )
    return DatasetInspection(
        row_count=int(payload.get('totalBytes') or 0),
        media_types=media_types,
        columns=columns,
        quality_report={
            'deduplication': 'scheduled',
            'caption_coverage': 'pending_inspection',
            'low_quality_filter': 'enabled',
            'schema_valid': bool(files),
        },
        lineage={'source': 'kaggle', 'dataset_ref': dataset_ref, 'version': payload.get('currentVersionNumber')},
        preview_samples=[{'file': file.get('name'), 'size': file.get('totalBytes')} for file in files[:6]],
    )


def inspect_local_upload(name: str) -> DatasetInspection:
    return DatasetInspection(
        row_count=0,
        media_types=['text'],
        columns=[{'name': 'pending_upload', 'dtype': 'file', 'nullable': False}],
        quality_report={'schema_valid': False, 'status': 'awaiting_file_validation'},
        lineage={'source': 'local', 'name': name},
        preview_samples=[],
    )
