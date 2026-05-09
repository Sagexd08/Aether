from __future__ import annotations
from typing import Any
from .config import get_settings

settings = get_settings()


async def enhance_prompt(mode: str, prompt: str) -> str:
    if mode == 'image':
        return f'{prompt}, cinematic lighting, premium composition, atmospheric depth'
    if mode == 'video':
        return f'{prompt}, cinematic motion, shot design, camera movement, atmospheric pacing'
    if mode == 'audio':
        return f'{prompt}, immersive sound design, premium mix, spatial ambience'
    return prompt


async def route_generation(mode: str, model: str | None, prompt: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    selected_model = model or {
        'text': 'HuggingFaceTB/SmolLM3-3B',
        'image': 'black-forest-labs/FLUX.1-schnell',
        'video': 'Wan-AI/Wan2.1-T2V-1.3B:fastest',
        'audio': 'facebook/musicgen-small'
    }.get(mode, 'unknown')

    if settings.hf_token:
        return {
            'provider': 'huggingface',
            'model': selected_model,
            'status': 'queued',
            'note': 'Hugging Face is configured as the primary provider via environment token only.'
        }

    return {
        'provider': 'fallback',
        'model': selected_model,
        'status': 'queued',
        'output_url': None,
        'output_text': 'Streaming text placeholder' if mode == 'text' else None,
    }
