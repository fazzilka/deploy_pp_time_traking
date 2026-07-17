from celery import Celery
from celery.signals import after_setup_logger, after_setup_task_logger

from src.core.config import settings
from src.core.logging import JsonFormatter, configure_logging

configure_logging(settings.log_level)

celery_app = Celery(
    "time_tracking",
    broker=settings.celery_broker_url,
    backend=None,
    include=["src.tasks.notifications", "src.tasks.transactional_email"],
)

celery_app.conf.update(
    beat_schedule={
        "scan_deadline_notifications": {
            "task": "src.tasks.notifications.scan_deadline_notifications",
            "schedule": 60.0,
        },
    },
    broker_connection_timeout=3,
    broker_connection_retry_on_startup=True,
    enable_utc=True,
    result_backend=None,
    task_always_eager=settings.celery_task_always_eager,
    task_ignore_result=True,
    timezone=settings.celery_timezone,
    worker_hijack_root_logger=False,
)


def _configure_celery_logger(logger: object, **_kwargs: object) -> None:
    handlers = getattr(logger, "handlers", ())
    for handler in handlers:
        handler.setFormatter(JsonFormatter())


after_setup_logger.connect(_configure_celery_logger)
after_setup_task_logger.connect(_configure_celery_logger)
