from uuid import uuid4
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from ..inference import enhance_prompt, route_generation
from ..schemas import GenerateRequest, GenerationResponse

router = APIRouter()


@router.post('', response_model=GenerationResponse)
async def create_generation(payload: GenerateRequest) -> GenerationResponse:
    prompt = await enhance_prompt(payload.mode, payload.prompt) if payload.enhance else payload.prompt
    await route_generation(payload.mode, payload.model, prompt, None)
    return GenerationResponse(id=str(uuid4()), status='queued')


@router.post('/stream')
async def stream_generation(payload: GenerateRequest) -> EventSourceResponse:
    prompt = await enhance_prompt(payload.mode, payload.prompt) if payload.enhance else payload.prompt

    async def event_generator():
        for index, chunk in enumerate((
            'AETHER is streaming your response',
            ' with editorial pacing,',
            ' structured clarity,',
            ' and multimodal context.',
        )):
            yield {'event': 'message', 'data': {'index': index, 'chunk': chunk, 'prompt': prompt}}

    return EventSourceResponse(event_generator())
