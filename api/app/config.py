"""Application settings, loaded from environment variables (see .env.example)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    # Async SQLAlchemy URL used by the API (least-privilege user in production).
    database_url: str = "postgresql+asyncpg://sei:sei@localhost:5432/sei"
    # URL used by Alembic migrations (owner user). Falls back to database_url.
    migrations_database_url: str | None = None
    # Comma-separated list of allowed CORS origins (only our own domain).
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:4321"])
    # Secret used to hash IPs of leads and sign sessions. Must be overridden.
    secret_key: str = "change-me"  # noqa: S105

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def alembic_url(self) -> str:
        return self.migrations_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
