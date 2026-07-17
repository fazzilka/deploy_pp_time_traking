import json
import logging
import sys
from datetime import UTC, datetime

from src.middleware.request_id import request_id_context

STRUCTURED_LOG_FIELDS = (
    "delivery_id",
    "notification_id",
    "purpose",
    "notification_type",
    "provider",
    "source_id",
    "skip_code",
    "error_code",
    "user_id",
    "attempt",
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_context.get(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for field in STRUCTURED_LOG_FIELDS:
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(level)
    root_logger.addHandler(handler)
