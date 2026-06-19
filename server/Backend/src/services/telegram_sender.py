from __future__ import annotations

import logging

import httpx

from src.core.config import settings
from src.models.enums import NotificationDeliveryStatus, NotificationType
from src.models.notification import Notification
from src.models.user import User
from src.services.delivery_result import DeliveryResult

logger = logging.getLogger(__name__)


async def send_notification_telegram(notification: Notification, user: User) -> DeliveryResult:
    if not settings.telegram_notifications_enabled:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "telegram disabled")
    if not settings.telegram_bot_token:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "telegram bot token missing")
    if not user.is_active:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "user inactive")
    if not user.telegram_notifications_enabled:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "user telegram disabled")
    if not user.telegram_chat_id:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "telegram chat id missing")

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                json={
                    "chat_id": user.telegram_chat_id,
                    "text": _message_text(notification),
                    "disable_web_page_preview": True,
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("telegram notification delivery failed: %s", type(exc).__name__)
        return DeliveryResult(NotificationDeliveryStatus.FAILED, type(exc).__name__)

    return DeliveryResult(NotificationDeliveryStatus.SENT)


def _message_text(notification: Notification) -> str:
    payload = notification.payload or {}
    if notification.type == NotificationType.DEADLINE_SOON:
        return "\n".join(
            [
                "Дедлайн скоро закончится",
                "",
                f"Задача: {payload.get('task_title', 'Без названия')}",
                f"Осталось: меньше {payload.get('remind_before_minutes', '-')} минут",
                f"Открыть: {settings.app_public_url}",
            ]
        )
    if notification.type == NotificationType.DEADLINE_OVERDUE:
        return "\n".join(
            [
                "Дедлайн просрочен",
                "",
                f"Задача: {payload.get('task_title', 'Без названия')}",
                f"Дедлайн был: {payload.get('deadline', '-')}",
                "",
                "Откройте Time Tracking, чтобы завершить задачу или перенести срок.",
            ]
        )
    if notification.type == NotificationType.WORKSPACE_MEMBER_ADDED:
        return "\n".join(
            [
                "Вас добавили в рабочее пространство",
                "",
                f"Workspace: {payload.get('workspace_name', '-')}",
                f"Открыть: {settings.app_public_url}",
            ]
        )
    if notification.type == NotificationType.WORKSPACE_MEMBER_REMOVED:
        return "\n".join(
            [
                "Вас удалили из рабочего пространства",
                "",
                f"Workspace: {payload.get('workspace_name', '-')}",
            ]
        )
    if notification.type == NotificationType.WORKSPACE_MEMBER_ROLE_CHANGED:
        return "\n".join(
            [
                "Ваша роль в рабочем пространстве изменена",
                "",
                f"Workspace: {payload.get('workspace_name', '-')}",
                f"Роль: {payload.get('role_display_name') or payload.get('role') or '-'}",
                f"Открыть: {settings.app_public_url}",
            ]
        )
    return f"{notification.title}\n\n{notification.message}"
