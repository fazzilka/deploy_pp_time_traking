from __future__ import annotations

# ruff: noqa: UP017
import logging
import random
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from src.core.celery_app import celery_app
from src.core.config import settings
from src.core.deadlines import (
    ensure_utc,
    format_deadline_readable,
    format_utc_iso,
    utc_now,
)
from src.models.enums import (
    NotificationDeliveryChannel,
    NotificationDeliveryStatus,
    NotificationType,
)
from src.models.notification import Notification, NotificationDelivery
from src.models.task import Task
from src.models.user import User
from src.models.workspace import Workspace
from src.services.delivery_result import DeliveryResult
from src.services.email_delivery import (
    RetryableEmailDeliveryError,
    deliver_email_notification_async,
)
from src.services.notification import create_notification
from src.services.telegram_sender import send_notification_telegram
from src.tasks.db import run_async_celery_task, run_celery_db_task

logger = logging.getLogger(__name__)


@celery_app.task(name="src.tasks.notifications.scan_deadline_notifications")  # type: ignore[untyped-decorator]
def scan_deadline_notifications() -> int:
    return run_async_celery_task(
        lambda: run_celery_db_task(
            lambda session_factory: scan_deadline_notifications_async(session_factory)
        )
    )


@celery_app.task(name="src.tasks.notifications.deliver_notification")  # type: ignore[untyped-decorator]
def deliver_notification(notification_id: int) -> None:
    run_async_celery_task(
        lambda: run_celery_db_task(
            lambda session_factory: deliver_notification_async(session_factory, notification_id)
        )
    )


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="src.tasks.notifications.send_email_notification",
    max_retries=settings.email_max_retries,
)
def send_email_notification(self: Any, notification_id: int) -> None:
    retries = int(self.request.retries)
    final_attempt = retries >= settings.email_max_retries
    try:
        run_async_celery_task(
            lambda: run_celery_db_task(
                lambda session_factory: deliver_email_notification_async(
                    session_factory,
                    notification_id,
                    final_attempt=final_attempt,
                )
            )
        )
    except RetryableEmailDeliveryError as exc:
        countdown = _email_retry_countdown(retries)
        raise self.retry(exc=exc, countdown=countdown) from exc


@celery_app.task(name="src.tasks.notifications.send_telegram_notification")  # type: ignore[untyped-decorator]
def send_telegram_notification(notification_id: int) -> None:
    run_async_celery_task(
        lambda: run_celery_db_task(
            lambda session_factory: deliver_notification_channel_async(
                session_factory,
                notification_id,
                NotificationDeliveryChannel.TELEGRAM,
            )
        )
    )


async def scan_deadline_notifications_async(
    session_factory: async_sessionmaker[AsyncSession],
    now_utc: datetime | None = None,
) -> int:
    created_count = 0
    async with session_factory() as session:
        now = now_utc.astimezone(timezone.utc) if now_utc else utc_now()
        reminder_minutes = settings.deadline_reminder_minutes
        scan_window_minutes = max(reminder_minutes, 1440)
        window_end = now + timedelta(minutes=scan_window_minutes)
        lookback_hours = settings.overdue_notification_lookback_hours
        overdue_window_start = now - timedelta(hours=lookback_hours)
        logger.info(
            "deadline_scan_started",
            extra={
                "now_utc": format_utc_iso(now),
                "reminder_minutes": reminder_minutes,
                "scan_window_minutes": scan_window_minutes,
                "overdue_lookback_hours": lookback_hours,
            },
        )

        upcoming_tasks = await _load_upcoming_deadline_tasks(session, now, window_end)
        for task in upcoming_tasks:
            task_deadline = ensure_utc(task.deadline)
            if task_deadline is None:
                continue
            remaining_minutes = max(1, int((task_deadline - now).total_seconds() / 60))
            reminder_boundary = reminder_minutes if remaining_minutes <= reminder_minutes else 1440
            notification = await _create_deadline_notification(
                session=session,
                task=task,
                now=now,
                notification_type=NotificationType.DEADLINE_SOON,
                reminder_minutes=reminder_boundary,
            )
            if notification is not None:
                created_count += 1
                _enqueue_delivery_from_worker(notification.id)

        overdue_tasks = await _load_overdue_deadline_tasks(session, overdue_window_start, now)
        for task in overdue_tasks:
            notification = await _create_deadline_notification(
                session=session,
                task=task,
                now=now,
                notification_type=NotificationType.DEADLINE_OVERDUE,
                reminder_minutes=reminder_minutes,
            )
            if notification is not None:
                created_count += 1
                _enqueue_delivery_from_worker(notification.id)

    logger.info(
        "deadline_scan_finished",
        extra={
            "created_count": created_count,
            "now_utc": format_utc_iso(now),
            "reminder_minutes": reminder_minutes,
            "overdue_lookback_hours": settings.overdue_notification_lookback_hours,
        },
    )
    return created_count


async def deliver_notification_async(
    session_factory: async_sessionmaker[AsyncSession],
    notification_id: int,
) -> None:
    await deliver_email_notification_async(
        session_factory,
        notification_id,
        final_attempt=True,
    )
    async with session_factory() as session:
        notification = await _load_notification(session, notification_id)
        if notification is None:
            logger.info("notification delivery skipped: notification missing")
            return
        await _deliver_telegram(session, notification)


async def deliver_notification_channel_async(
    session_factory: async_sessionmaker[AsyncSession],
    notification_id: int,
    channel: NotificationDeliveryChannel,
) -> None:
    if channel == NotificationDeliveryChannel.EMAIL:
        await deliver_email_notification_async(
            session_factory,
            notification_id,
            final_attempt=True,
        )
        return
    async with session_factory() as session:
        notification = await _load_notification(session, notification_id)
        if notification is None:
            logger.info("notification channel delivery skipped: notification missing")
            return
        if channel == NotificationDeliveryChannel.TELEGRAM:
            await _deliver_telegram(session, notification)


async def _load_upcoming_deadline_tasks(
    session: AsyncSession,
    now: datetime,
    window_end: datetime,
) -> list[Task]:
    result = await session.execute(
        select(Task)
        .join(Workspace, Workspace.id == Task.workspace_id)
        .where(
            Workspace.is_protected.is_(False),
            Task.deadline.is_not(None),
            Task.is_completed.is_(False),
            Task.deadline > now,
            Task.deadline <= window_end,
        )
        .options(
            selectinload(Task.assignee),
            selectinload(Task.created_by),
            selectinload(Task.workspace),
        )
    )
    return list(result.scalars().unique().all())


async def _load_overdue_deadline_tasks(
    session: AsyncSession,
    window_start: datetime,
    now: datetime,
) -> list[Task]:
    result = await session.execute(
        select(Task)
        .join(Workspace, Workspace.id == Task.workspace_id)
        .where(
            Workspace.is_protected.is_(False),
            Task.deadline.is_not(None),
            Task.is_completed.is_(False),
            Task.deadline <= now,
            Task.deadline >= window_start,
        )
        .options(
            selectinload(Task.assignee),
            selectinload(Task.created_by),
            selectinload(Task.workspace),
        )
    )
    return list(result.scalars().unique().all())


async def _create_deadline_notification(
    *,
    session: AsyncSession,
    task: Task,
    now: datetime,
    notification_type: NotificationType,
    reminder_minutes: int,
) -> Notification | None:
    deadline_at = ensure_utc(task.deadline)
    if deadline_at is None:
        logger.info("deadline_notification_skipped_no_deadline", extra={"task_id": task.id})
        return None
    if task.is_completed:
        logger.info(
            "deadline_notification_skipped_completed",
            extra={"task_id": task.id, "deadline_utc": format_utc_iso(deadline_at)},
        )
        return None

    recipient = task.assignee or task.created_by
    if recipient is None or not recipient.is_active:
        logger.info(
            "deadline_notification_skipped_no_recipient",
            extra={"task_id": task.id, "deadline_utc": format_utc_iso(deadline_at)},
        )
        return None

    if notification_type == NotificationType.DEADLINE_SOON:
        if deadline_at <= now:
            return None
        deadline_iso = format_utc_iso(deadline_at)
        dedupe_key = (
            f"deadline_soon:task:{task.id}:user:{recipient.id}:"
            f"deadline:{deadline_iso}:minutes:{reminder_minutes}"
        )
        notification = await create_notification(
            session,
            user_id=recipient.id,
            type=NotificationType.DEADLINE_SOON,
            title=("Дедлайн через 24 часа" if reminder_minutes >= 1440 else "Дедлайн через 1 час"),
            message=(
                f"До дедлайна задачи «{task.title}» осталось примерно "
                f"{'24 часа' if reminder_minutes >= 1440 else '1 час'}.\n"
                f"Дедлайн: {format_deadline_readable(deadline_at)}."
            ),
            workspace_id=task.workspace_id,
            task_id=task.id,
            payload={
                "task_id": task.id,
                "task_title": task.title,
                "workspace_id": task.workspace_id,
                "workspace_name": task.workspace.name if task.workspace else None,
                "deadline": deadline_iso,
                "remind_before_minutes": reminder_minutes,
                "triggered_at": format_utc_iso(now),
                "event": "deadline_soon",
            },
            dedupe_key=dedupe_key,
        )
        log_name = "deadline_soon_created"
    else:
        if deadline_at > now:
            return None
        deadline_iso = format_utc_iso(deadline_at)
        overdue_seconds = max(0, int((now - deadline_at).total_seconds()))
        dedupe_key = f"deadline_overdue:task:{task.id}:user:{recipient.id}:deadline:{deadline_iso}"
        notification = await create_notification(
            session,
            user_id=recipient.id,
            type=NotificationType.DEADLINE_OVERDUE,
            title="Дедлайн просрочен",
            message=(
                f"Задача «{task.title}» просрочена.\n"
                f"Дедлайн был {format_deadline_readable(deadline_at)}."
            ),
            workspace_id=task.workspace_id,
            task_id=task.id,
            payload={
                "task_id": task.id,
                "task_title": task.title,
                "workspace_id": task.workspace_id,
                "workspace_name": task.workspace.name if task.workspace else None,
                "deadline": deadline_iso,
                "triggered_at": format_utc_iso(now),
                "overdue_by_seconds": overdue_seconds,
                "event": "deadline_overdue",
            },
            dedupe_key=dedupe_key,
        )
        log_name = "deadline_overdue_created"

    log_extra = {
        "task_id": task.id,
        "user_id": recipient.id,
        "deadline_utc": deadline_iso,
        "now_utc": format_utc_iso(now),
        "remaining_seconds": int((deadline_at - now).total_seconds()),
        "overdue_seconds": max(0, int((now - deadline_at).total_seconds())),
        "reminder_minutes": reminder_minutes,
        "overdue_lookback_hours": settings.overdue_notification_lookback_hours,
    }
    if notification is None:
        logger.info("deadline_notification_skipped_duplicate", extra=log_extra)
        return None

    logger.info(log_name, extra=log_extra)
    return notification


def _enqueue_delivery_from_worker(notification_id: int) -> None:
    if settings.outbound_email_enabled:
        try:
            send_email_notification.delay(notification_id)
        except Exception:
            logger.exception(
                "failed to enqueue notification email from worker",
                extra={"notification_id": notification_id},
            )
    if settings.telegram_notifications_enabled:
        try:
            send_telegram_notification.delay(notification_id)
        except Exception:
            logger.exception(
                "failed to enqueue notification telegram from worker",
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
    delivery = await _get_or_create_delivery(
        session,
        notification.id,
        channel,
        user_id=notification.user_id,
    )
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


async def _get_or_create_delivery(
    session: AsyncSession,
    notification_id: int,
    channel: NotificationDeliveryChannel,
    *,
    user_id: int,
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
        user_id=user_id,
        channel=channel,
        status=NotificationDeliveryStatus.PENDING,
    )
    session.add(delivery)
    await session.flush()
    return delivery


def _email_retry_countdown(retries: int) -> int:
    exponential_delay = settings.email_retry_base_seconds * (4 ** max(retries, 0))
    capped_delay = min(exponential_delay, 2 * 60 * 60)
    jitter = random.randint(0, max(1, capped_delay // 5))
    return int(capped_delay + jitter)
