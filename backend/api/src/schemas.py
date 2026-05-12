from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SignUpRequest(BaseModel):
    email: EmailStr
    name: str
    password: str


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(OrmModel):
    id: str
    email: EmailStr
    name: str
    credits_remaining: int
    role: str = 'owner'
    workspace_id: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


class RefreshResponse(BaseModel):
    access_token: str


class GenerateRequest(BaseModel):
    mode: str
    prompt: str
    enhance: bool = False
    model: str | None = None


class GenerationResponse(BaseModel):
    id: str
    status: str


class WorkspaceResponse(OrmModel):
    id: str
    name: str
    plan: str


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    mode: str = 'multimodal'


class ProjectResponse(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    workspace_id: str
    created_at: datetime


class DatasetImportRequest(BaseModel):
    source: str = Field(pattern='^(huggingface|kaggle|local)$')
    source_ref: str = Field(min_length=2, max_length=512)
    name: str | None = Field(default=None, max_length=255)
    workspace_id: str | None = None


class DatasetResponse(OrmModel):
    id: str
    workspace_id: str
    source: str
    source_ref: str
    name: str
    status: str
    row_count: int
    media_types: list[str]
    columns: list[dict]
    quality_report: dict
    lineage: dict
    preview_samples: list[dict]
    created_at: datetime
    updated_at: datetime


class DatasetOut(OrmModel):
    id: str
    workspace_id: str
    source: str
    source_ref: str
    name: str
    status: str
    progress: int
    row_count: int
    sample_count: int
    media_types: list[str]
    columns: list[dict]
    quality_report: dict
    lineage: dict
    preview_samples: list[dict]
    ingestion_config: dict
    error_message: str | None
    last_error_code: str | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DatasetImportResponse(BaseModel):
    dataset_id: str
    status: str = 'queued'


class DatasetPreviewResponse(BaseModel):
    rows: list[dict]
    total: int
    offset: int
    limit: int


class TrainingJobCreate(BaseModel):
    dataset_id: str
    workspace_id: str | None = None
    task_type: str = 'text-classification'
    base_model: str = 'sentence-transformers/all-MiniLM-L6-v2'
    adapter_method: str = Field(default='lora', pattern='^(lora|qlora|adapter|prompt|sklearn-baseline)$')


class TrainingJobResponse(OrmModel):
    id: str
    workspace_id: str
    dataset_id: str
    status: str
    task_type: str
    base_model: str
    adapter_method: str
    progress: int
    worker_status: str
    metrics: dict
    artifact_paths: dict
    checkpoint_versions: list[dict]
    error: str | None
    created_at: datetime
    updated_at: datetime


class ModelRegistryResponse(OrmModel):
    id: str
    workspace_id: str
    training_job_id: str | None
    name: str
    version: str
    base_model: str
    artifact_uri: str
    artifact_format: str
    metrics: dict
    deployment_status: str
    created_at: datetime


class AssetResponse(OrmModel):
    id: str
    workspace_id: str
    generation_id: str | None
    kind: str
    name: str
    uri: str
    metadata_json: dict
    created_at: datetime


class NotificationResponse(OrmModel):
    id: str
    workspace_id: str
    kind: str
    title: str
    body: str
    status: str
    created_at: datetime


class Page(BaseModel):
    items: list[dict]
    total: int
    limit: int
    offset: int


class AssetOut(OrmModel):
    id: str
    generation_job_id: str
    user_id: str
    workspace_id: str
    generation_index: int
    type: str
    storage_key: str
    mime_type: str
    file_size_bytes: int | None
    width: int | None
    height: int | None
    duration_seconds: float | None
    metadata_json: dict = Field(serialization_alias='metadata')
    is_favorite: bool
    visibility: str
    status: str
    created_at: datetime


class GenerationJobOut(OrmModel):
    id: str
    user_id: str
    workspace_id: str
    project_id: str | None
    mode: str
    prompt: str
    negative_prompt: str | None
    model: str
    provider: str
    seed: int | None
    status: str
    progress: int
    error_message: str | None
    last_error_code: str | None
    retry_count: int
    cancel_requested: bool
    credits_cost: int | None = Field(default=None, serialization_alias='creditsCosted')
    idempotency_key: str | None = None
    metadata_json: dict = Field(serialization_alias='metadata')
    visibility: str
    preview_storage_key: str | None
    source_generation_job_id: str | None
    queue_wait_ms: int | None
    inference_duration_ms: int | None
    persist_duration_ms: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    assets: list[AssetOut] = []


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    negative_prompt: str | None = Field(default=None, max_length=1000)
    model: str = 'black-forest-labs/FLUX.1-schnell'
    seed: int | None = None
    metadata: dict = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=64)


class AsyncGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    negative_prompt: str | None = Field(default=None, max_length=1000)
    model: str | None = None
    seed: int | None = None
    metadata: dict = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=64)


class AsyncGenerateResponse(BaseModel):
    job_id: str
    status: str = 'queued'


class ImageGenerateResponse(BaseModel):
    job: GenerationJobOut
    asset: AssetOut


class JobsPageResponse(BaseModel):
    jobs: list[GenerationJobOut]
    next_cursor: str | None


class FavoriteResponse(BaseModel):
    is_favorite: bool
