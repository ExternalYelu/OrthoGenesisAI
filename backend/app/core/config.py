from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "OrthoGenesisAI"
    env: str = "dev"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 120

    database_url: str = "postgresql+psycopg2://orthogenesis:orthogenesis@localhost:5432/orthogenesis"

    s3_endpoint_url: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_bucket: str = "orthogenesis"
    s3_region: str = "us-east-1"

    cors_origins: str = "http://localhost:3000"
    queue_backend: str = "local"
    redis_url: str = "redis://localhost:6379/0"
    reconstruction_model: str = "heightmap"
    reconstruction_batch_size: int = 4
    reconstruction_seed: int = 42

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
