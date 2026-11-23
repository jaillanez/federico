import pytest

from app.config import InsecureConfigError, Settings


def test_production_rejects_default_secret() -> None:
    with pytest.raises(InsecureConfigError):
        Settings(environment="production", secret_key="change-me").check_secure()


def test_production_rejects_short_secret() -> None:
    with pytest.raises(InsecureConfigError):
        Settings(environment="production", secret_key="x" * 31).check_secure()


def test_error_and_repr_do_not_leak_secret() -> None:
    leaked = "short-but-secret-value"
    with pytest.raises(InsecureConfigError) as exc:
        Settings(environment="production", secret_key=leaked).check_secure()
    assert leaked not in str(exc.value)
    assert leaked not in repr(Settings(secret_key=leaked))


def test_production_accepts_strong_secret() -> None:
    strong = Settings(
        environment="production",
        secret_key="x" * 32,
        turnstile_secret_key="t",
        mail_backend="smtp",
        session_cookie_secure=True,
    )
    assert strong.check_secure().is_production


def test_development_allows_dev_secret() -> None:
    assert not Settings(environment="development").check_secure().is_production


def test_production_requires_turnstile_and_smtp() -> None:
    with pytest.raises(InsecureConfigError):
        Settings(environment="production", secret_key="x" * 32, mail_backend="smtp").check_secure()
    with pytest.raises(InsecureConfigError):
        Settings(
            environment="production",
            secret_key="x" * 32,
            turnstile_secret_key="t",
            mail_backend="memory",
        ).check_secure()
