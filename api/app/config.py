"""Application settings, loaded from environment variables (see .env.example)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

WEAK_SECRETS = frozenset({"change-me", "dev-secret-change-me"})
MIN_SECRET_LENGTH = 32


class InsecureConfigError(RuntimeError):
    """Raised outside pydantic so the offending value is never echoed."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    # Async SQLAlchemy URL used by the API (least-privilege user in production).
    database_url: str = "postgresql+asyncpg://sei:sei@localhost:5432/sei"
    # URL used by Alembic migrations (owner user). Falls back to database_url.
    migrations_database_url: str | None = None
    # Allowed CORS origins (only our own domain), as a JSON list.
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:4321"])
    # Secret used to hash IPs of leads and sign sessions. SecretStr keeps it out of reprs.
    secret_key: SecretStr = SecretStr("change-me")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def alembic_url(self) -> str:
        return self.migrations_database_url or self.database_url

    def check_secure(self) -> "Settings":
        secret = self.secret_key.get_secret_value()
        if self.is_production and (secret in WEAK_SECRETS or len(secret) < MIN_SECRET_LENGTH):
            raise InsecureConfigError(
                f"SECRET_KEY: usá una clave aleatoria de {MIN_SECRET_LENGTH}+ caracteres"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings().check_secure()
