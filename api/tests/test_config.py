import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_rejects_default_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="change-me")


def test_production_rejects_short_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="x" * 31)


def test_validation_error_does_not_leak_secret() -> None:
    leaked = "short-but-secret-value"
    with pytest.raises(ValidationError) as exc:
        Settings(environment="production", secret_key=leaked)
    assert leaked not in str(exc.value)
    assert leaked not in repr(Settings(secret_key=leaked))


def test_production_accepts_strong_secret() -> None:
    assert Settings(environment="production", secret_key="x" * 32).is_production
