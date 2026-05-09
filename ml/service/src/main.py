from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title='AETHER ML Service')


class RouteRequest(BaseModel):
    mode: str
    prompt: str
    model: str | None = None


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/route')
async def route(request: RouteRequest) -> dict[str, str]:
    selected_model = request.model or {
        'text': 'HuggingFaceTB/SmolLM3-3B',
        'image': 'black-forest-labs/FLUX.1-schnell',
        'video': 'Wan-AI/Wan2.1-T2V-1.3B:fastest',
        'audio': 'facebook/musicgen-small',
    }.get(request.mode, 'fallback')
    return {'mode': request.mode, 'model': selected_model, 'status': 'routed', 'provider': 'huggingface'}
