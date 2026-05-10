from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'AETHER AI API'
    environment: str = 'development'
    database_url: str = 'postgresql+asyncpg://postgres:postgres@localhost:5432/aether'
    redis_url: str = 'redis://localhost:6379/0'
    jwt_secret: str = 'change-me'
    jwt_algorithm: str = 'HS256'
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14
    huggingface_token: str | None = None
    kaggle_username: str | None = None
    kaggle_key: str | None = None
    object_storage_url: str | None = None
    object_storage_access_key: str | None = None
    object_storage_secret_key: str | None = None
    model_registry_path: str = './artifacts/models'
    training_output_path: str = './artifacts/training'
    upload_max_mb: int = 512
    rate_limit_per_minute: int = 120

    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')


@lru_cache
def get_settings() -> Settings:
    return Settings()
