import pytest
from pydantic import ValidationError

from src.core.config import Settings

VALID_PRODUCTION_SETTINGS = {
    "environment": "production",
    "jwt_secret_key": "prod-jwt-secret-with-enough-entropy",
    "database_url": "postgresql+asyncpg://app_user:strong-db-pass@postgres:5432/time_tracking",
    "celery_broker_url": "amqp://app_user:strong-rabbit-pass@rabbitmq:5672//",
}


def make_settings(**overrides) -> Settings:
    values = {**VALID_PRODUCTION_SETTINGS, **overrides}
    return Settings(_env_file=None, **values)


def test_development_allows_local_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.environment == "development"


@pytest.mark.parametrize(
    "secret",
    ["", "change-me", "ci-only-secret-key"],
)
def test_production_rejects_placeholder_jwt_secret(secret: str) -> None:
    with pytest.raises(ValidationError):
        make_settings(jwt_secret_key=secret)


def test_production_rejects_default_database_password() -> None:
    with pytest.raises(ValidationError):
        make_settings(
            database_url="postgresql+asyncpg://postgres:postgres@postgres:5432/time_tracking"
        )


def test_production_rejects_default_rabbitmq_password() -> None:
    with pytest.raises(ValidationError):
        make_settings(celery_broker_url="amqp://time_tracking:time_tracking@rabbitmq:5672//")


def test_email_notifications_require_complete_smtp_settings() -> None:
    with pytest.raises(ValidationError):
        make_settings(email_notifications_enabled=True)

    settings = make_settings(
        email_notifications_enabled=True,
        smtp_host="smtp.example.invalid",
        smtp_port=587,
        smtp_username="mailer",
        smtp_password="smtp-password",
        smtp_from_email="noreply@example.invalid",
    )

    assert settings.email_notifications_enabled is True


def test_telegram_notifications_require_bot_token() -> None:
    with pytest.raises(ValidationError):
        make_settings(telegram_notifications_enabled=True)

    settings = make_settings(
        telegram_notifications_enabled=True,
        telegram_bot_token="telegram-token-placeholder-for-test",
    )

    assert settings.telegram_notifications_enabled is True
