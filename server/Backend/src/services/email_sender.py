from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from src.core.config import settings
from src.models.enums import NotificationDeliveryStatus, NotificationType
from src.models.notification import Notification
from src.models.user import User
from src.services.delivery_result import DeliveryResult

logger = logging.getLogger(__name__)


def send_notification_email(notification: Notification, user: User) -> DeliveryResult:
    if not settings.email_notifications_enabled:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "email disabled")
    if not user.is_active:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "user inactive")
    if not user.email:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "user email missing")
    if not settings.smtp_host or not settings.smtp_from_email:
        return DeliveryResult(NotificationDeliveryStatus.SKIPPED, "smtp settings incomplete")

    message = _build_email_message(notification, user)
    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                _send_with_client(smtp, message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                _send_with_client(smtp, message)
    except smtplib.SMTPException as exc:
        logger.warning("smtp notification delivery failed: %s", type(exc).__name__)
        return DeliveryResult(NotificationDeliveryStatus.FAILED, type(exc).__name__)
    except OSError as exc:
        logger.warning("smtp notification delivery network error: %s", type(exc).__name__)
        return DeliveryResult(NotificationDeliveryStatus.FAILED, type(exc).__name__)

    return DeliveryResult(NotificationDeliveryStatus.SENT)


def _send_with_client(smtp: smtplib.SMTP, message: EmailMessage) -> None:
    if settings.smtp_username:
        smtp.login(settings.smtp_username, settings.smtp_password)
    smtp.send_message(message)


def _build_email_message(notification: Notification, user: User) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = _subject(notification)
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = user.email
    message.set_content(_body(notification))
    return message


def _subject(notification: Notification) -> str:
    subjects = {
        NotificationType.DEADLINE_SOON: "Time Tracking - дедлайн задачи скоро закончится",
        NotificationType.WORKSPACE_MEMBER_ADDED: (
            "Time Tracking - вас добавили в рабочее пространство"
        ),
        NotificationType.WORKSPACE_MEMBER_REMOVED: (
            "Time Tracking - вас удалили из рабочего пространства"
        ),
        NotificationType.WORKSPACE_MEMBER_ROLE_CHANGED: (
            "Time Tracking - ваша роль в рабочем пространстве изменена"
        ),
    }
    return subjects.get(notification.type, f"Time Tracking - {notification.title}")


def _body(notification: Notification) -> str:
    payload = notification.payload or {}
    lines = [notification.title, "", notification.message, ""]

    if notification.type == NotificationType.DEADLINE_SOON:
        lines.extend(
            [
                f"Задача: {payload.get('task_title', 'Без названия')}",
                f"Workspace: {payload.get('workspace_name') or payload.get('workspace_id') or '-'}",
                f"Дедлайн: {payload.get('deadline', '-')}",
            ]
        )
    elif notification.type in {
        NotificationType.WORKSPACE_MEMBER_ADDED,
        NotificationType.WORKSPACE_MEMBER_REMOVED,
        NotificationType.WORKSPACE_MEMBER_ROLE_CHANGED,
    }:
        lines.append(f"Workspace: {payload.get('workspace_name', '-')}")
        if notification.type == NotificationType.WORKSPACE_MEMBER_ROLE_CHANGED:
            lines.append(
                f"Новая роль: {payload.get('role_display_name') or payload.get('role') or '-'}"
            )
        if notification.type == NotificationType.WORKSPACE_MEMBER_REMOVED:
            lines.append("Рабочее пространство больше может быть недоступно вашему профилю.")

    lines.extend(["", f"Открыть приложение: {settings.app_public_url}"])
    return "\n".join(lines)
