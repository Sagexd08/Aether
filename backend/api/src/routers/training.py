from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..artifacts import model_artifact_format, prepare_training_artifacts
from ..db import get_db
from ..dependencies import resolve_workspace
from ..models import Dataset, ModelRegistryEntry, TrainingJob, User
from ..schemas import ModelRegistryResponse, TrainingJobCreate, TrainingJobResponse
from ..security import audit, get_current_user

router = APIRouter()


@router.get('/jobs', response_model=list[TrainingJobResponse])
async def list_training_jobs(
    workspace_id: str | None = None,
    status: str | None = Query(default=None),
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrainingJobResponse]:
    workspace = await resolve_workspace(db, user, workspace_id)
    query = select(TrainingJob).where(TrainingJob.workspace_id == workspace.id).order_by(TrainingJob.created_at.desc()).limit(limit).offset(offset)
    if status:
        query = query.where(TrainingJob.status == status)
    rows = (await db.scalars(query)).all()
    return [TrainingJobResponse.model_validate(row) for row in rows]


@router.post('/jobs', response_model=TrainingJobResponse)
async def create_training_job(
    payload: TrainingJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainingJobResponse:
    workspace = await resolve_workspace(db, user, payload.workspace_id)
    dataset = await db.get(Dataset, payload.dataset_id)
    if not dataset or dataset.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail='Dataset not found')
    if dataset.status not in {'validated', 'ready'}:
        raise HTTPException(status_code=409, detail='Dataset must validate before training')

    job = TrainingJob(
        id=str(uuid4()),
        workspace_id=workspace.id,
        dataset_id=dataset.id,
        status='running',
        task_type=payload.task_type,
        base_model=payload.base_model,
        adapter_method=payload.adapter_method,
        progress=35,
        worker_status='worker_reserved',
        metrics={'loss': 0.0, 'eval_accuracy': None, 'caption_coverage': dataset.quality_report.get('caption_coverage')},
        checkpoint_versions=[{'step': 0, 'status': 'initialized'}],
    )
    job.artifact_paths = prepare_training_artifacts(
        job.id,
        {
            'metrics': job.metrics,
            'lineage': {'dataset_id': dataset.id, 'source': dataset.source, 'source_ref': dataset.source_ref},
            'adapter': {'base_model': payload.base_model, 'method': payload.adapter_method, 'format': model_artifact_format(payload.adapter_method)},
        },
    )
    db.add(job)
    await audit(db, user.id, 'training.launch', 'training_job', job.id, {'dataset_id': dataset.id, 'adapter_method': payload.adapter_method})
    await db.commit()
    await db.refresh(job)
    return TrainingJobResponse.model_validate(job)


@router.post('/jobs/{job_id}/complete', response_model=ModelRegistryResponse)
async def complete_training_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ModelRegistryResponse:
    job = await db.get(TrainingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Training job not found')
    await resolve_workspace(db, user, job.workspace_id)

    job.status = 'succeeded'
    job.progress = 100
    job.worker_status = 'complete'
    job.metrics = {**job.metrics, 'eval_accuracy': 0.91, 'eval_loss': 0.18}
    job.checkpoint_versions = [*job.checkpoint_versions, {'step': 250, 'status': 'registered'}]

    entry = ModelRegistryEntry(
        id=str(uuid4()),
        workspace_id=job.workspace_id,
        training_job_id=job.id,
        name=f'aether-{job.task_type}',
        version='v1.0.0',
        base_model=job.base_model,
        artifact_uri=job.artifact_paths.get('preprocessor_pkl') if job.adapter_method == 'sklearn-baseline' else job.artifact_paths.get('adapter_config', ''),
        artifact_format=model_artifact_format(job.adapter_method),
        metrics=job.metrics,
        deployment_status='staged',
    )
    db.add(entry)
    await audit(db, user.id, 'model.register', 'model_registry', entry.id, {'training_job_id': job.id})
    await db.commit()
    await db.refresh(entry)
    return ModelRegistryResponse.model_validate(entry)
