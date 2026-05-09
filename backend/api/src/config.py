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
    hf_token: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    replicate_api_token: str | None = None

    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')


@lru_cache
def get_settings() -> Settings:
    return Settings()
