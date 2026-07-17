from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.models.enums import NotificationType
from src.models.notification import Notification

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(UTC)


async def create_notification(
    session: AsyncSession,
    *,
    user_id: int,
    type: NotificationType,
    title: str,
    message: str,
    workspace_id: int | None = None,
    task_id: int | None = None,
    invitation_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
    dedupe_key: str | None = None,
) -> Notification | None:
    if dedupe_key is not None:
        existing = await _get_by_dedupe_key(session, dedupe_key)
        if existing is not None:
            return None

    notification = Notification(
        user_id=user_id,
        workspace_id=workspace_id,
        task_id=task_id,
        invitation_id=invitation_id,
        type=type,
        title=title,
        message=message,
        payload=payload,
        dedupe_key=dedupe_key,
    )
    session.add(notification)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if dedupe_key is not None and await _get_by_dedupe_key(session, dedupe_key) is not None:
            logger.info("notification dedupe hit", extra={"dedupe_key": dedupe_key})
            return None
        raise

    await session.refresh(notification)
    return notification


async def list_user_notifications(
    session: AsyncSession,
    *,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    unread_only: bool = False,
) -> tuple[list[Notification], int, int]:
    stmt = _user_notifications_stmt(user_id, unread_only=unread_only).order_by(
        Notification.created_at.desc(),
        Notification.id.desc(),
    )
    result = await session.execute(stmt.limit(limit).offset(offset))
    items = list(result.scalars().all())

    total = await _scalar_int(
        session,
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            *([Notification.is_read.is_(False)] if unread_only else []),
        ),
    )
    unread_count = await get_unread_count(session, user_id=user_id)
    return items, total, unread_count


async def get_unread_count(session: AsyncSession, *, user_id: int) -> int:
    return await _scalar_int(
        session,
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        ),
    )


async def mark_as_read(
    session: AsyncSession,
    *,
    user_id: int,
    notification_id: int,
) -> Notification | None:
    result = await session.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        return None

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = utc_now()
        await session.commit()
        await session.refresh(notification)
    return notification


async def mark_all_as_read(session: AsyncSession, *, user_id: int) -> int:
    now = utc_now()
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=now)
        .returning(Notification.id)
    )
    updated_ids = result.scalars().all()
    await session.commit()
    return len(updated_ids)


async def mark_as_read_or_404(
    session: AsyncSession,
    *,
    user_id: int,
    notification_id: int,
) -> Notification:
    notification = await mark_as_read(
        session,
        user_id=user_id,
        notification_id=notification_id,
    )
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено",
        )
    return notification


def enqueue_notification_delivery(notification_id: int) -> None:
    from src.tasks.notifications import send_email_notification, send_telegram_notification

    if settings.outbound_email_enabled:
        try:
            send_email_notification.delay(notification_id)
        except Exception:
            logger.exception(
                "failed to enqueue notification email",
                extra={"notification_id": notification_id},
            )
    if settings.telegram_notifications_enabled:
        try:
            send_telegram_notification.delay(notification_id)
        except Exception:
            logger.exception(
                "failed to enqueue notification telegram",
                extra={"notification_id": notification_id},
            )


async def _get_by_dedupe_key(session: AsyncSession, dedupe_key: str) -> Notification | None:
    result = await session.execute(
        select(Notification).where(Notification.dedupe_key == dedupe_key).limit(1)
    )
    return result.scalar_one_or_none()


def _user_notifications_stmt(user_id: int, *, unread_only: bool) -> Select[tuple[Notification]]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return stmt


async def _scalar_int(session: AsyncSession, stmt: Select[tuple[int]]) -> int:
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)
