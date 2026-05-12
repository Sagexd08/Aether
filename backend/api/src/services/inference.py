import asyncio
import base64
import io
import time
from dataclasses import dataclass
from typing import AsyncGenerator, AsyncIterator, Protocol

from ..config import get_settings
from ..models import GenerationJob

CREDIT_COSTS: dict[str, int] = {'image': 10, 'video': 50, 'audio': 20, 'text': 5}
DEFAULT_MODELS: dict[str, str] = {
    'image': 'black-forest-labs/FLUX.1-schnell',
    'video': 'Wan-AI/Wan2.1-T2V-1.3B',
    'audio': 'facebook/musicgen-small',
}


@dataclass
class ProviderUpdate:
    status: str          # preprocessing | running | postprocessing | persisting | completed | failed
    progress: int        # 0-100
    storage_key: str | None = None   # set when completed
    mime_type: str | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    error_message: str | None = None
    error_code: str | None = None
    inference_duration_ms: int | None = None


class InferenceProvider(Protocol):
    async def generate(self, job: GenerationJob) -> AsyncGenerator[ProviderUpdate, None]: ...


class HuggingFaceProvider:
    """Wraps HF InferenceClient. All HF-specific semantics stay inside this class."""

    async def generate(self, job: GenerationJob) -> AsyncGenerator[ProviderUpdate, None]:
        from huggingface_hub import InferenceClient

        token = get_settings().huggingface_token
        client = InferenceClient(token=token)
        model = job.model or DEFAULT_MODELS.get(job.mode, '')

        yield ProviderUpdate(status='preprocessing', progress=10)

        inference_start = time.time()

        if job.mode == 'image':
            yield ProviderUpdate(status='running', progress=30)
            try:
                loop = asyncio.get_event_loop()
                image = await loop.run_in_executor(None, lambda: client.text_to_image(
                    job.prompt,
                    model=model,
                    negative_prompt=job.negative_prompt,
                ))
            except Exception as exc:
                yield ProviderUpdate(
                    status='failed', progress=0,
                    error_message=str(exc), error_code='hf_inference_error',
                )
                return

            inference_ms = int((time.time() - inference_start) * 1000)

            # Encode to base64 data URL (Sprint 2 dev — no object storage yet)
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            b64 = base64.b64encode(buf.getvalue()).decode()
            storage_key = f'data:image/png;base64,{b64}'

            yield ProviderUpdate(
                status='completed', progress=100,
                storage_key=storage_key,
                mime_type='image/png',
                width=image.width,
                height=image.height,
                inference_duration_ms=inference_ms,
            )

        elif job.mode == 'audio':
            yield ProviderUpdate(status='running', progress=30)
            try:
                loop = asyncio.get_event_loop()
                audio_bytes = await loop.run_in_executor(None, lambda: client.text_to_speech(job.prompt, model=model))
            except Exception as exc:
                yield ProviderUpdate(
                    status='failed', progress=0,
                    error_message=str(exc), error_code='hf_inference_error',
                )
                return

            inference_ms = int((time.time() - inference_start) * 1000)
            b64 = base64.b64encode(audio_bytes).decode()
            storage_key = f'data:audio/wav;base64,{b64}'

            yield ProviderUpdate(
                status='completed', progress=100,
                storage_key=storage_key,
                mime_type='audio/wav',
                inference_duration_ms=inference_ms,
            )

        elif job.mode == 'video':
            yield ProviderUpdate(status='running', progress=20)
            # HF video generation is long-running — simulate progress ticks
            # Real implementation would poll HF async task
            try:
                for tick_progress in range(25, 80, 10):
                    await asyncio.sleep(5)
                    if job.cancel_requested:
                        yield ProviderUpdate(status='cancelled', progress=tick_progress)
                        return
                    yield ProviderUpdate(status='running', progress=tick_progress)

                loop = asyncio.get_event_loop()
                video_bytes = await loop.run_in_executor(None, lambda: client.text_to_video(job.prompt, model=model))
            except Exception as exc:
                yield ProviderUpdate(
                    status='failed', progress=0,
                    error_message=str(exc), error_code='hf_inference_error',
                )
                return

            inference_ms = int((time.time() - inference_start) * 1000)
            b64 = base64.b64encode(video_bytes).decode()
            storage_key = f'data:video/mp4;base64,{b64}'

            yield ProviderUpdate(
                status='completed', progress=100,
                storage_key=storage_key,
                mime_type='video/mp4',
                inference_duration_ms=inference_ms,
            )

        else:
            yield ProviderUpdate(
                status='failed', progress=0,
                error_message=f'Mode {job.mode!r} not supported',
                error_code='unsupported_mode',
            )
