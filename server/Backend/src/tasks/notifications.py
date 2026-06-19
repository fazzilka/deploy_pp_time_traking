from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.celery_app import celery_app
from src.core.config import settings
from src.db.session import AsyncSessionFactory
from src.models.enums import (
    NotificationDeliveryChannel,
    NotificationDeliveryStatus,
    NotificationType,
)
from src.models.notification import Notification, NotificationDelivery
from src.models.task import Task
from src.models.user import User
from src.services.delivery_result import DeliveryResult
from src.services.email_sender import send_notification_email
from src.services.notification import create_notification
from src.services.telegram_sender import send_notification_telegram

logger = logging.getLogger(__name__)


@celery_app.task(name="src.tasks.notifications.scan_deadline_notifications")  # type: ignore[untyped-decorator]
def scan_deadline_notifications() -> int:
    return asyncio.run(scan_deadline_notifications_async())


@celery_app.task(name="src.tasks.notifications.deliver_notification")  # type: ignore[untyped-decorator]
def deliver_notification(notification_id: int) -> None:
    asyncio.run(deliver_notification_async(notification_id))


@celery_app.task(name="src.tasks.notifications.send_email_notification")  # type: ignore[untyped-decorator]
def send_email_notification(notification_id: int) -> None:
    asyncio.run(
        deliver_notification_channel_async(notification_id, NotificationDeliveryChannel.EMAIL)
    )


@celery_app.task(name="src.tasks.notifications.send_telegram_notification")  # type: ignore[untyped-decorator]
def send_telegram_notification(notification_id: int) -> None:
    asyncio.run(
        deliver_notification_channel_async(notification_id, NotificationDeliveryChannel.TELEGRAM)
    )


async def scan_deadline_notifications_async() -> int:
    created_count = 0
    async with AsyncSessionFactory() as session:
        now = datetime.now(UTC)
        reminder_minutes = settings.deadline_reminder_minutes
        window_end = now + timedelta(minutes=reminder_minutes)
        tasks = await _load_deadline_candidate_tasks(session, now.date(), window_end.date())

        for task in tasks:
            deadline_at = _deadline_as_datetime(task.deadline)
            if deadline_at is None or deadline_at <= now or deadline_at > window_end:
                continue
            if task.is_completed:
                continue

            recipient = task.assignee or task.created_by
            if recipient is None or not recipient.is_active:
                continue

            notification = await create_notification(
                session,
                user_id=recipient.id,
                type=NotificationType.DEADLINE_SOON,
                title="Дедлайн скоро закончится",
                message=(
                    f"До дедлайна задачи «{task.title}» осталось меньше {reminder_minutes} минут."
                ),
                workspace_id=task.workspace_id,
                task_id=task.id,
                payload={
                    "task_id": task.id,
                    "task_title": task.title,
                    "workspace_id": task.workspace_id,
                    "workspace_name": task.workspace.name if task.workspace else None,
                    "deadline": deadline_at.isoformat(),
                    "remind_before_minutes": reminder_minutes,
                    "event": "deadline_soon",
                },
                dedupe_key=(
                    f"deadline_soon:task:{task.id}:user:{recipient.id}:minutes:{reminder_minutes}"
                ),
            )
            if notification is None:
                continue
            created_count += 1
            _enqueue_delivery_from_worker(notification.id)

    logger.info("deadline notification scan completed", extra={"created_count": created_count})
    return created_count


async def deliver_notification_async(notification_id: int) -> None:
    async with AsyncSessionFactory() as session:
        notification = await _load_notification(session, notification_id)
        if notification is None:
            logger.info("notification delivery skipped: notification missing")
            return
        await _deliver_email(session, notification)
        await _deliver_telegram(session, notification)


async def deliver_notification_channel_async(
    notification_id: int,
    channel: NotificationDeliveryChannel,
) -> None:
    async with AsyncSessionFactory() as session:
        notification = await _load_notification(session, notification_id)
        if notification is None:
            logger.info("notification channel delivery skipped: notification missing")
            return
        if channel == NotificationDeliveryChannel.EMAIL:
            await _deliver_email(session, notification)
        elif channel == NotificationDeliveryChannel.TELEGRAM:
            await _deliver_telegram(session, notification)


async def _load_deadline_candidate_tasks(
    session: AsyncSession,
    start_date: date,
    end_date: date,
) -> list[Task]:
    result = await session.execute(
        select(Task)
        .where(
            Task.deadline.is_not(None),
            Task.is_completed.is_(False),
            Task.deadline >= start_date,
            Task.deadline <= end_date,
        )
        .options(
            selectinload(Task.assignee),
            selectinload(Task.created_by),
            selectinload(Task.workspace),
        )
    )
    return list(result.scalars().unique().all())


def _deadline_as_datetime(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, time.max, tzinfo=UTC)


def _enqueue_delivery_from_worker(notification_id: int) -> None:
    if not settings.email_notifications_enabled and not settings.telegram_notifications_enabled:
        return
    try:
        deliver_notification.delay(notification_id)
    except Exception:
        logger.exception(
            "failed to enqueue notification delivery from worker",
            extra={"notification_id": notification_id},
        )


async def _load_notification(
    session: AsyncSession,
    notification_id: int,
) -> Notification | None:
    result = await session.execute(
        select(Notification)
        .where(Notification.id == notification_id)
        .options(selectinload(Notification.user))
    )
    return result.scalar_one_or_none()


async def _deliver_email(session: AsyncSession, notification: Notification) -> None:
    await _deliver_channel(
        session,
        notification,
        NotificationDeliveryChannel.EMAIL,
        lambda item, user: _sync_result(send_notification_email(item, user)),
    )


async def _deliver_telegram(session: AsyncSession, notification: Notification) -> None:
    await _deliver_channel(
        session,
        notification,
        NotificationDeliveryChannel.TELEGRAM,
        send_notification_telegram,
    )


async def _deliver_channel(
    session: AsyncSession,
    notification: Notification,
    channel: NotificationDeliveryChannel,
    sender: Callable[[Notification, User], Awaitable[DeliveryResult]],
) -> None:
    delivery = await _get_or_create_delivery(session, notification.id, channel)
    if delivery.status == NotificationDeliveryStatus.SENT:
        return

    delivery.attempts += 1
    result = await sender(notification, notification.user)
    delivery.status = result.status
    if result.status == NotificationDeliveryStatus.FAILED:
        delivery.last_error = result.detail
    else:
        delivery.last_error = None
    if result.status == NotificationDeliveryStatus.SENT:
        delivery.sent_at = datetime.now(UTC)
    await session.commit()


async def _sync_result(result: DeliveryResult) -> DeliveryResult:
    return result


async def _get_or_create_delivery(
    session: AsyncSession,
    notification_id: int,
    channel: NotificationDeliveryChannel,
) -> NotificationDelivery:
    result = await session.execute(
        select(NotificationDelivery).where(
            NotificationDelivery.notification_id == notification_id,
            NotificationDelivery.channel == channel,
        )
    )
    delivery = result.scalar_one_or_none()
    if delivery is not None:
        return delivery

    delivery = NotificationDelivery(
        notification_id=notification_id,
        channel=channel,
        status=NotificationDeliveryStatus.PENDING,
    )
    session.add(delivery)
    await session.flush()
    return delivery
