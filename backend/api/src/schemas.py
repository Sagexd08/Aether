from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


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
