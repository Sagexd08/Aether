from __future__ import annotations

import json
import asyncio
from typing import Any, AsyncIterator

import httpx

from .config import get_settings

_HF_API = 'https://api-inference.huggingface.co/models'
_HF_ROUTER = 'https://router.huggingface.co'


def _headers() -> dict[str, str]:
    token = get_settings().hf_token
    if not token:
        raise RuntimeError('HF_TOKEN is not configured in the environment.')
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


async def text_generate(model: str, prompt: str, max_tokens: int = 512) -> str:
    url = f'{_HF_ROUTER}/v1/chat/completions'
    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'stream': False,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        response.raise_for_status()
        data = response.json()
        return data['choices'][0]['message']['content']


async def text_stream(model: str, prompt: str, max_tokens: int = 512) -> AsyncIterator[str]:
    url = f'{_HF_ROUTER}/v1/chat/completions'
    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'stream': True,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream('POST', url, headers=_headers(), json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith('data:'):
                    continue
                raw = line[len('data:'):].strip()
                if raw == '[DONE]':
                    break
                try:
                    chunk = json.loads(raw)
                    delta = chunk['choices'][0]['delta'].get('content', '')
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError):
                    continue


async def image_generate(model: str, prompt: str) -> bytes:
    url = f'{_HF_API}/{model}'
    payload = {'inputs': prompt}
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        response.raise_for_status()
        return response.content


async def video_generate(model: str, prompt: str) -> bytes:
    url = f'{_HF_API}/{model}'
    payload = {'inputs': prompt}
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        response.raise_for_status()
        return response.content


async def audio_generate(model: str, prompt: str) -> bytes:
    url = f'{_HF_API}/{model}'
    payload = {'inputs': prompt}
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(url, headers=_headers(), json=payload)
        response.raise_for_status()
        return response.content
