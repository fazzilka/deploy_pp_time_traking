from dataclasses import dataclass

from src.models.enums import NotificationDeliveryStatus


@dataclass(slots=True)
class DeliveryResult:
    status: NotificationDeliveryStatus
    detail: str | None = None
