import json
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from sse_starlette.sse import EventSourceResponse
from ..inference import enhance_prompt, route_generation, stream_text
from ..models import Generation, User
from ..schemas import GenerateRequest, GenerationResponse
from ..security import audit, get_current_user

router = APIRouter()


@router.post('', response_model=GenerationResponse)
async def create_generation(
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GenerationResponse:
    prompt = await enhance_prompt(payload.mode, payload.prompt) if payload.enhance else payload.prompt
    try:
        result = await route_generation(payload.mode, payload.model, prompt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    status = result.get('status', 'queued')
    generation = Generation(
        id=str(uuid4()),
        user_id=user.id,
        mode=payload.mode,
        status=status,
        prompt=payload.prompt,
        enhanced_prompt=prompt if payload.enhance else None,
        model_used=result.get('model'),
        output_text=result.get('message'),
    )
    db.add(generation)
    await audit(db, user.id, 'generation.create', 'generation', generation.id, {'mode': payload.mode})
    await db.commit()
    return GenerationResponse(id=generation.id, status=status)


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
