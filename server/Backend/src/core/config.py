from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_host: str = "localhost"
    app_port: int = 8000
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/time_tracking"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout_seconds: int = 30
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    app_public_url: str = "https://time-tracking.online"
    celery_broker_url: str = "amqp://time_tracking:time_tracking@rabbitmq:5672//"
    celery_task_always_eager: bool = False
    celery_timezone: str = "UTC"
    deadline_reminder_minutes: int = 60
    email_notifications_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Time Tracking"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    telegram_notifications_enabled: bool = False
    telegram_bot_token: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


settings = Settings()
