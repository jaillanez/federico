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
    # Public base URL of the public bucket / CDN (project photos).
    public_media_url: str = "http://localhost:9000/sei-public"
    # Secret used to hash IPs of leads and sign sessions. SecretStr keeps it out of reprs.
    secret_key: SecretStr = SecretStr("change-me")
    # Public URL of the website (links in emails, e.g. to the admin panel).
    public_site_url: str = "http://localhost:4321"

    # --- S3-compatible storage (MinIO locally, Cloudflare R2 in production) ---
    # Endpoint as reached by the API; None means AWS S3.
    s3_endpoint_url: str | None = "http://localhost:9010"
    # Endpoint used only to SIGN download URLs, when browsers reach the storage through another
    # address (self-hosted MinIO behind our Caddy: the public site URL). None = s3_endpoint_url.
    s3_presign_endpoint_url: str | None = None
    s3_region: str = "auto"
    s3_access_key: SecretStr = SecretStr("sei-minio")
    s3_secret_key: SecretStr = SecretStr("sei-minio-secret")
    s3_bucket_public: str = "sei-public"
    # Lead files: never public, only reachable through short-lived signed URLs.
    s3_bucket_private: str = "sei-private"
    # Encrypted database backups (private; see infra/backup.sh).
    backup_bucket: str = "sei-backups"

    # --- Email ---
    # smtp: real delivery (Mailpit locally); memory: kept in a list (tests); console: logged.
    mail_backend: Literal["smtp", "memory", "console"] = "smtp"
    smtp_host: str = "localhost"
    smtp_port: int = 1125
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    mail_from: str = "S.E.I. Servicio Eléctrico Integral <no-responder@servielect.com.ar>"
    # Who receives new-lead notifications. TODO(federico): confirm the address.
    mail_leads_to: str = "servielect@infovia.com.ar"

    # --- Cloudflare Turnstile ---
    # Empty disables the captcha check (only allowed outside production).
    turnstile_secret_key: SecretStr = SecretStr("")

    # --- Admin sessions ---
    session_cookie_name: str = "sei_session"
    session_hours: int = 12
    # Secure cookies require HTTPS; only disable for local http development.
    session_cookie_secure: bool = True
    login_max_attempts: int = 5
    login_lock_minutes: int = 15

    # --- Site rebuild (after publishing content) ---
    # Webhook that rebuilds the static site (local build server or a Cloudflare Pages deploy hook).
    rebuild_webhook_url: str | None = None
    rebuild_webhook_token: SecretStr = SecretStr("")
    # Requests within this window are grouped into a single rebuild.
    rebuild_delay_seconds: float = 60

    # --- Leads ---
    leads_per_ip_per_hour: int = 5
    # Ley 25.326: leads in "nuevo" or "descartado" are deleted after this many months.
    lead_retention_months: int = 24

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def trusted_origins(self) -> set[str]:
        """Origins allowed to send state-changing requests to the panel (CSRF check)."""
        return {o.rstrip("/") for o in [*self.cors_origins, self.public_site_url]}

    @property
    def alembic_url(self) -> str:
        return self.migrations_database_url or self.database_url

    def check_secure(self) -> "Settings":
        secret = self.secret_key.get_secret_value()
        if self.is_production and (secret in WEAK_SECRETS or len(secret) < MIN_SECRET_LENGTH):
            raise InsecureConfigError(
                f"SECRET_KEY: usá una clave aleatoria de {MIN_SECRET_LENGTH}+ caracteres"
            )
        if self.is_production and not self.turnstile_secret_key.get_secret_value():
            raise InsecureConfigError("TURNSTILE_SECRET_KEY es obligatoria en producción")
        if self.is_production and not self.session_cookie_secure:
            raise InsecureConfigError("SESSION_COOKIE_SECURE no puede ser false en producción")
        if self.is_production and self.mail_backend != "smtp":
            raise InsecureConfigError("MAIL_BACKEND tiene que ser smtp en producción")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings().check_secure()
