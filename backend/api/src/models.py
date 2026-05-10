from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    credits_remaining: Mapped[int] = mapped_column(Integer, default=1000)
    role: Mapped[str] = mapped_column(String(40), default='owner')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Workspace(Base):
    __tablename__ = 'workspaces'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    name: Mapped[str] = mapped_column(String(255))
    plan: Mapped[str] = mapped_column(String(40), default='studio')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Project(Base):
    __tablename__ = 'projects'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(40), default='multimodal')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Generation(Base):
    __tablename__ = 'generations'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    mode: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), default='queued')
    prompt: Mapped[str] = mapped_column(Text)
    enhanced_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(255), nullable=True)
    output_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    credits_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Asset(Base):
    __tablename__ = 'assets'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    generation_id: Mapped[str | None] = mapped_column(ForeignKey('generations.id'), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(255))
    uri: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Dataset(Base):
    __tablename__ = 'datasets'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    source: Mapped[str] = mapped_column(String(40), index=True)
    source_ref: Mapped[str] = mapped_column(String(512))
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), default='queued', index=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    media_types: Mapped[list[str]] = mapped_column(JSON, default=list)
    columns: Mapped[list[dict]] = mapped_column(JSON, default=list)
    quality_report: Mapped[dict] = mapped_column(JSON, default=dict)
    lineage: Mapped[dict] = mapped_column(JSON, default=dict)
    preview_samples: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TrainingJob(Base):
    __tablename__ = 'training_jobs'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey('datasets.id'), index=True)
    status: Mapped[str] = mapped_column(String(40), default='queued', index=True)
    task_type: Mapped[str] = mapped_column(String(60), default='text-classification')
    base_model: Mapped[str] = mapped_column(String(255), default='sentence-transformers/all-MiniLM-L6-v2')
    adapter_method: Mapped[str] = mapped_column(String(40), default='lora')
    progress: Mapped[int] = mapped_column(Integer, default=0)
    worker_status: Mapped[str] = mapped_column(String(80), default='waiting_for_worker')
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    artifact_paths: Mapped[dict] = mapped_column(JSON, default=dict)
    checkpoint_versions: Mapped[list[dict]] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ModelRegistryEntry(Base):
    __tablename__ = 'model_registry'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    training_job_id: Mapped[str | None] = mapped_column(ForeignKey('training_jobs.id'), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str] = mapped_column(String(80))
    base_model: Mapped[str] = mapped_column(String(255))
    artifact_uri: Mapped[str] = mapped_column(Text)
    artifact_format: Mapped[str] = mapped_column(String(40))
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    deployment_status: Mapped[str] = mapped_column(String(40), default='staged')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(80))
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = 'notifications'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('workspaces.id'), index=True)
    kind: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default='unread')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
