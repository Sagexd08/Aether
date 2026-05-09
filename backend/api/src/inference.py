from __future__ import annotations

import base64
from typing import Any, AsyncIterator

from .config import get_settings
from . import hf_client

_DEFAULT_MODELS: dict[str, str] = {
    'text': 'HuggingFaceTB/SmolLM3-3B',
    'image': 'black-forest-labs/FLUX.1-schnell',
    'video': 'Wan-AI/Wan2.1-T2V-1.3B:fastest',
    'audio': 'facebook/musicgen-small',
}


def _resolve_model(mode: str, model: str | None) -> str:
    return model or _DEFAULT_MODELS.get(mode, 'HuggingFaceTB/SmolLM3-3B')


async def enhance_prompt(mode: str, prompt: str) -> str:
    suffixes: dict[str, str] = {
        'image': ', cinematic lighting, premium composition, atmospheric depth',
        'video': ', cinematic motion, shot design, camera movement, atmospheric pacing',
        'audio': ', immersive sound design, premium mix, spatial ambience',
    }
    return prompt + suffixes.get(mode, '')


async def route_generation(
    mode: str,
    model: str | None,
    prompt: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    selected = _resolve_model(mode, model)

    if not settings.hf_token:
        return {
            'provider': 'fallback',
            'model': selected,
            'status': 'queued',
            'output_url': None,
            'output_text': '[HF_TOKEN not set — configure it in .env to enable real inference]',
        }

    if mode == 'text':
        text = await hf_client.text_generate(selected, prompt)
        return {'provider': 'huggingface', 'model': selected, 'status': 'completed', 'output_text': text}

    if mode == 'image':
        raw = await hf_client.image_generate(selected, prompt)
        b64 = base64.b64encode(raw).decode()
        return {
            'provider': 'huggingface',
            'model': selected,
            'status': 'completed',
            'output_b64': b64,
            'content_type': 'image/jpeg',
        }

    if mode == 'video':
        raw = await hf_client.video_generate(selected, prompt)
        b64 = base64.b64encode(raw).decode()
        return {
            'provider': 'huggingface',
            'model': selected,
            'status': 'completed',
            'output_b64': b64,
            'content_type': 'video/mp4',
        }

    if mode == 'audio':
        raw = await hf_client.audio_generate(selected, prompt)
        b64 = base64.b64encode(raw).decode()
        return {
            'provider': 'huggingface',
            'model': selected,
            'status': 'completed',
            'output_b64': b64,
            'content_type': 'audio/flac',
        }

    return {'provider': 'huggingface', 'model': selected, 'status': 'queued'}


async def stream_text(
    model: str | None,
    prompt: str,
) -> AsyncIterator[str]:
    settings = get_settings()
    selected = _resolve_model('text', model)

    if not settings.hf_token:
        for word in '[HF_TOKEN not set — configure it in .env to enable real inference]'.split():
            yield word + ' '
        return

    async for chunk in hf_client.text_stream(selected, prompt):
        yield chunk
