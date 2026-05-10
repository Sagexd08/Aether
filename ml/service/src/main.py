from fastapi import FastAPI
from pydantic import BaseModel, Field

from .training_pipeline import export_adapter_metadata, train_sklearn_baseline, write_run_metadata

app = FastAPI(title='AETHER ML Service')


class RouteRequest(BaseModel):
    mode: str
    prompt: str
    model: str | None = None


class TrainRequest(BaseModel):
    job_id: str
    adapter_method: str = Field(pattern='^(lora|qlora|adapter|prompt|sklearn-baseline)$')
    base_model: str = 'sentence-transformers/all-MiniLM-L6-v2'
    output_root: str = './artifacts/training'
    texts: list[str] = []
    labels: list[str] = []


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


@app.post('/train')
async def train(request: TrainRequest) -> dict:
    if request.adapter_method == 'sklearn-baseline':
        texts = request.texts or ['cinematic frame', 'ambient audio', 'training caption', 'asset prompt']
        labels = request.labels or ['image', 'audio', 'text', 'image']
        run = train_sklearn_baseline(request.job_id, texts, labels, request.output_root)
    else:
        run = export_adapter_metadata(request.job_id, request.base_model, request.adapter_method, request.output_root)  # type: ignore[arg-type]
    metadata_path = write_run_metadata(run)
    return {'status': 'completed', 'metadata_path': metadata_path, 'metrics': run.metrics, 'artifacts': run.artifacts}
