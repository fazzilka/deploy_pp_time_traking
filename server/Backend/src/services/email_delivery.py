from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from time import perf_counter

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from src.core.config import settings
from src.core.metrics import (
    EMAIL_DELIVERY_FAILED,
    EMAIL_DELIVERY_PENDING,
    EMAIL_SEND_ATTEMPTS,
    EMAIL_SEND_DURATION,
)
from src.models.enums import (
    NotificationDeliveryChannel,
    NotificationDeliveryStatus,
    NotificationType,
)
from src.models.notification import Notification, NotificationDelivery
from src.models.task import Task
from src.services.email_provider import (
    EmailMessage,
    EmailProvider,
    EmailProviderError,
    format_sender,
    get_email_provider,
)
from src.services.email_templates import render_notification_email

logger = logging.getLogger(__name__)

TERMINAL_EMAIL_STATUSES = {
    NotificationDeliveryStatus.SENT,
    NotificationDeliveryStatus.DELIVERED,
    NotificationDeliveryStatus.BOUNCED,
    NotificationDeliveryStatus.COMPLAINED,
    NotificationDeliveryStatus.FAILED,
    NotificationDeliveryStatus.SUPPRESSED,
    NotificationDeliveryStatus.SKIPPED,
}


class RetryableEmailDeliveryError(RuntimeError):
    pass


async def deliver_email_notification_async(
    session_factory: async_sessionmaker[AsyncSession],
    notification_id: int,
    *,
    final_attempt: bool = False,
    provider: EmailProvider | None = None,
) -> None:
    async with session_factory() as session:
        notification = await _load_notification(session, notification_id)
        if notification is None:
            logger.info(
                "email_delivery_notification_missing", extra={"notification_id": notification_id}
            )
            return

        delivery = await _lock_delivery(session, notification)
        if delivery.status in TERMINAL_EMAIL_STATUSES:
            return

        skip_reason = _email_skip_reason(notification)
        if skip_reason is not None:
            _mark_skipped(delivery, skip_reason)
            await session.commit()
            return

        rendered = render_notification_email(
            notification,
            locale=notification.user.locale,
            config=settings,
        )
        if rendered is None:
            _mark_skipped(delivery, "unsupported_notification_type")
            await session.commit()
            return

        selected_provider = provider or get_email_provider()
        sender_email = (
            settings.resend_from_email
            if settings.configured_email_provider == "resend"
            else settings.smtp_from_email
        )
        sender_name = (
            settings.resend_from_name
            if settings.configured_email_provider == "resend"
            else settings.smtp_from_name
        )
        message = EmailMessage(
            recipient=notification.user.email,
            sender=format_sender(sender_name, sender_email),
            subject=rendered.subject,
            html=rendered.html,
            text=rendered.text,
            idempotency_key=delivery.idempotency_key or _idempotency_key(notification.id),
            reply_to=settings.email_reply_to or None,
            tags={"notification": str(notification.id), "type": notification.type.value},
        )

        now = datetime.now(UTC)
        delivery.status = NotificationDeliveryStatus.SENDING
        delivery.sending_at = now
        delivery.attempts += 1
        delivery.provider = selected_provider.name
        delivery.recipient_email = notification.user.email
        delivery.last_error = None
        delivery.last_error_code = None
        EMAIL_DELIVERY_PENDING.inc()
        started_at = perf_counter()
        try:
            result = await asyncio.to_thread(selected_provider.send, message)
        except EmailProviderError as exc:
            EMAIL_SEND_DURATION.labels(provider=selected_provider.name).observe(
                perf_counter() - started_at
            )
            EMAIL_SEND_ATTEMPTS.labels(provider=selected_provider.name, status="failed").inc()
            delivery.last_error_code = exc.code[:64]
            delivery.last_error = str(exc)[:500]
            delivery.failed_at = now if final_attempt or not exc.retryable else None
            delivery.status = (
                NotificationDeliveryStatus.FAILED
                if final_attempt or not exc.retryable
                else NotificationDeliveryStatus.QUEUED
            )
            await session.commit()
            EMAIL_DELIVERY_PENDING.dec()
            if delivery.status == NotificationDeliveryStatus.FAILED:
                EMAIL_DELIVERY_FAILED.inc()
                return
            raise RetryableEmailDeliveryError(exc.code) from exc

        EMAIL_SEND_DURATION.labels(provider=selected_provider.name).observe(
            perf_counter() - started_at
        )
        EMAIL_SEND_ATTEMPTS.labels(provider=selected_provider.name, status="accepted").inc()
        delivery.provider = result.provider
        delivery.provider_message_id = result.provider_message_id
        delivery.status = (
            NotificationDeliveryStatus.SENT
            if result.accepted
            else NotificationDeliveryStatus.SKIPPED
        )
        delivery.sent_at = now if result.accepted else None
        delivery.last_error = None
        delivery.last_error_code = None
        await session.commit()
        EMAIL_DELIVERY_PENDING.dec()
        logger.info(
            "email_delivery_finished",
            extra={
                "notification_id": notification.id,
                "delivery_id": delivery.id,
                "provider": result.provider,
                "provider_message_id": result.provider_message_id,
                "attempt": delivery.attempts,
                "status": delivery.status.value,
            },
        )


async def _load_notification(
    session: AsyncSession,
    notification_id: int,
) -> Notification | None:
    result = await session.execute(
        select(Notification)
        .where(Notification.id == notification_id)
        .options(
            selectinload(Notification.user),
            selectinload(Notification.workspace),
            selectinload(Notification.task).selectinload(Task.workspace),
        )
    )
    return result.scalar_one_or_none()


async def _lock_delivery(
    session: AsyncSession,
    notification: Notification,
) -> NotificationDelivery:
    idempotency_key = _idempotency_key(notification.id)
    await session.execute(
        insert(NotificationDelivery)
        .values(
            notification_id=notification.id,
            user_id=notification.user_id,
            channel=NotificationDeliveryChannel.EMAIL.value,
            status=NotificationDeliveryStatus.QUEUED.value,
            provider=settings.configured_email_provider,
            idempotency_key=idempotency_key,
            queued_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(
            index_elements=["notification_id", "channel"],
        )
    )
    result = await session.execute(
        select(NotificationDelivery)
        .where(
            NotificationDelivery.notification_id == notification.id,
            NotificationDelivery.channel == NotificationDeliveryChannel.EMAIL,
        )
        .with_for_update()
    )
    delivery = result.scalar_one()
    delivery.idempotency_key = delivery.idempotency_key or idempotency_key
    delivery.queued_at = delivery.queued_at or datetime.now(UTC)
    return delivery


def _email_skip_reason(notification: Notification) -> str | None:
    user = notification.user
    if not settings.outbound_email_enabled:
        return "email_disabled"
    if not user.is_active:
        return "inactive_user"
    if not user.email:
        return "missing_email"
    if not user.email_notifications_enabled:
        return "user_opt_out"
    if user.email_suppressed_at is not None:
        return "recipient_suppressed"
    if notification.workspace is not None and notification.workspace.is_protected:
        return "protected_space"
    if notification.task is not None and notification.task.workspace.is_protected:
        return "protected_space"
    if notification.type == NotificationType.DEADLINE_OVERDUE:
        return None if user.email_deadline_overdue else "deadline_overdue_opt_out"
    if notification.type == NotificationType.DEADLINE_SOON:
        reminder_minutes = int((notification.payload or {}).get("remind_before_minutes") or 0)
        if reminder_minutes >= 1440:
            return None if user.email_deadline_24h else "deadline_24h_opt_out"
        return None if user.email_deadline_1h else "deadline_1h_opt_out"
    return "unsupported_notification_type"


def _mark_skipped(delivery: NotificationDelivery, reason: str) -> None:
    delivery.status = NotificationDeliveryStatus.SKIPPED
    delivery.last_error_code = reason
    delivery.last_error = None


def _idempotency_key(notification_id: int) -> str:
    return f"notification:{notification_id}:email:v1"
