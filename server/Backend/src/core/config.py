from typing import Literal, Self
from urllib.parse import unquote, urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRETS = {
    "",
    "change-me",
    "changeme",
    "secret",
    "password",
    "postgres",
    "time_tracking",
    "ci-only-secret-key",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_host: str = "localhost"
    app_port: int = 8000
    environment: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/time_tracking"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout_seconds: int = 30
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    app_timezone: str = "Europe/Moscow"
    app_public_url: str = "https://time-tracking.online"
    celery_broker_url: str = "amqp://time_tracking:time_tracking@rabbitmq:5672//"
    celery_task_always_eager: bool = False
    celery_timezone: str = "UTC"
    deadline_reminder_minutes: int = 60
    overdue_notification_lookback_hours: int = 24
    email_notifications_enabled: bool = False
    email_enabled: bool = False
    email_provider: Literal["disabled", "smtp", "resend"] = "disabled"
    email_reply_to: str = ""
    email_default_locale: Literal["ru", "en"] = "ru"
    email_base_url: str = "https://time-tracking.online"
    email_max_retries: int = 5
    email_retry_base_seconds: int = 30
    email_request_timeout_seconds: float = 10.0
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Time Tracking"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    resend_api_key: str = ""
    resend_api_url: str = "https://api.resend.com"
    resend_from_email: str = ""
    resend_from_name: str = "Time Tracking"
    resend_webhook_secret: str = ""
    telegram_notifications_enabled: bool = False
    telegram_bot_token: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]

    @property
    def configured_email_provider(self) -> Literal["disabled", "smtp", "resend"]:
        if self.email_notifications_enabled and self.email_provider == "disabled":
            return "smtp"
        return self.email_provider

    @property
    def outbound_email_enabled(self) -> bool:
        return self.email_enabled or self.email_notifications_enabled

    @model_validator(mode="after")
    def validate_production_configuration(self) -> Self:
        if self.environment.lower() == "production":
            self._require_non_placeholder("JWT_SECRET_KEY", self.jwt_secret_key)
            self._validate_database_url()
            self._validate_celery_broker_url()
        if self.outbound_email_enabled and self.configured_email_provider == "disabled":
            raise ValueError("EMAIL_PROVIDER must be configured when email delivery is enabled")
        if self.outbound_email_enabled and self.configured_email_provider == "smtp":
            missing_email = [
                name
                for name, value in {
                    "SMTP_HOST": self.smtp_host,
                    "SMTP_USERNAME": self.smtp_username,
                    "SMTP_PASSWORD": self.smtp_password,
                    "SMTP_FROM_EMAIL": self.smtp_from_email,
                }.items()
                if not str(value).strip()
            ]
            if self.smtp_port <= 0:
                missing_email.append("SMTP_PORT")
            if missing_email:
                raise ValueError(
                    "Email notifications require complete SMTP configuration: "
                    + ", ".join(missing_email)
                )
        if self.outbound_email_enabled and self.configured_email_provider == "resend":
            missing_resend = [
                name
                for name, value in {
                    "RESEND_API_KEY": self.resend_api_key,
                    "RESEND_FROM_EMAIL": self.resend_from_email,
                    "RESEND_WEBHOOK_SECRET": self.resend_webhook_secret,
                }.items()
                if not value.strip()
            ]
            if missing_resend:
                raise ValueError("Resend email delivery requires: " + ", ".join(missing_resend))
        if self.email_max_retries < 0:
            raise ValueError("EMAIL_MAX_RETRIES must be non-negative")
        if self.email_retry_base_seconds <= 0:
            raise ValueError("EMAIL_RETRY_BASE_SECONDS must be positive")
        if self.email_request_timeout_seconds <= 0:
            raise ValueError("EMAIL_REQUEST_TIMEOUT_SECONDS must be positive")
        if self.telegram_notifications_enabled and not self.telegram_bot_token.strip():
            raise ValueError("Telegram notifications require TELEGRAM_BOT_TOKEN")
        return self

    @staticmethod
    def _is_placeholder(value: str) -> bool:
        normalized = value.strip().lower()
        return normalized in PLACEHOLDER_SECRETS

    def _require_non_placeholder(self, name: str, value: str | None) -> None:
        if value is None or self._is_placeholder(value):
            raise ValueError(f"{name} must be configured with a non-placeholder value")

    def _validate_database_url(self) -> None:
        parsed = urlsplit(self.database_url)
        password = unquote(parsed.password or "")
        self._require_non_placeholder("DATABASE_URL password", password)

    def _validate_celery_broker_url(self) -> None:
        parsed = urlsplit(self.celery_broker_url)
        password = unquote(parsed.password or "")
        self._require_non_placeholder("CELERY_BROKER_URL password", password)


settings = Settings()
