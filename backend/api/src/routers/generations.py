import json
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from ..inference import enhance_prompt, route_generation, stream_text
from ..schemas import GenerateRequest, GenerationResponse

router = APIRouter()


@router.post('', response_model=GenerationResponse)
async def create_generation(payload: GenerateRequest) -> GenerationResponse:
    prompt = await enhance_prompt(payload.mode, payload.prompt) if payload.enhance else payload.prompt
    try:
        result = await route_generation(payload.mode, payload.model, prompt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    status = result.get('status', 'queued')
    return GenerationResponse(id=str(uuid4()), status=status)


@router.post('/stream')
async def stream_generation(payload: GenerateRequest) -> EventSourceResponse:
    prompt = await enhance_prompt(payload.mode, payload.prompt) if payload.enhance else payload.prompt

    async def event_generator():
        index = 0
        async for chunk in stream_text(payload.model, prompt):
            yield {
                'event': 'message',
                'data': json.dumps({'index': index, 'chunk': chunk}),
            }
            index += 1
        yield {'event': 'done', 'data': json.dumps({'total': index})}

    return EventSourceResponse(event_generator())
