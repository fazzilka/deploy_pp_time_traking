"""Safely explain the delivery decision for one notification without sending email."""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.core.config import settings
from src.db.session import AsyncSessionFactory
from src.models.enums import NotificationDeliveryChannel
from src.models.notification import Notification, NotificationDelivery
from src.models.task import Task
from src.services.email_delivery import (
    TERMINAL_EMAIL_STATUSES,
    _email_skip_reason,
    _idempotency_key,
)
from src.services.email_templates import render_notification_email


def _mask_email(value: str | None) -> str | None:
    if not value or "@" not in value:
        return None
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


async def diagnose(notification_id: int) -> dict[str, Any]:
    """Return a read-only diagnostic payload without exposing recipient data."""
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(Notification)
            .where(Notification.id == notification_id)
            .options(
                selectinload(Notification.user),
                selectinload(Notification.workspace),
                selectinload(Notification.task).selectinload(Task.workspace),
            )
        )
        notification = result.scalar_one_or_none()
        if notification is None:
            return {
                "notification_id": notification_id,
                "exists": False,
                "decision": "skip",
                "reason": "notification_missing",
            }

        delivery_result = await session.execute(
            select(NotificationDelivery).where(
                NotificationDelivery.notification_id == notification_id,
                NotificationDelivery.channel == NotificationDeliveryChannel.EMAIL,
            )
        )
        delivery = delivery_result.scalar_one_or_none()
        policy_reason = _email_skip_reason(notification)
        template_supported = (
            render_notification_email(
                notification, locale=notification.user.locale, config=settings
            )
            is not None
        )
        if policy_reason is None and not template_supported:
            policy_reason = "unsupported_notification_type"
        decision = "skip" if policy_reason else "send"
        reason = policy_reason
        if delivery is not None and delivery.status in TERMINAL_EMAIL_STATUSES:
            decision = "no_action"
            reason = "already_terminal"
        return {
            "notification_id": notification.id,
            "exists": True,
            "user_exists": notification.user is not None,
            "purpose": "notification",
            "notification_type": notification.type.value,
            "user_id": notification.user_id,
            "recipient_present": bool(notification.user.email),
            "recipient_masked": _mask_email(notification.user.email),
            "email_verified": notification.user.email_verified,
            "global_enabled": settings.outbound_email_enabled,
            "provider": settings.configured_email_provider,
            "preference_storage": "users columns",
            "preference_row_exists": None,
            "master_opt_in": notification.user.email_notifications_enabled,
            "category_opt_in": _category_opt_in(notification),
            "template_supported": template_supported,
            "protected_content": _is_protected(notification),
            "existing_delivery": (
                {
                    "id": delivery.id,
                    "status": delivery.status.value,
                    "last_error_code": delivery.last_error_code,
                }
                if delivery is not None
                else None
            ),
            "idempotency_key": _idempotency_key(notification.id),
            "policy_decision": "skip" if policy_reason else "send",
            "policy_reason": policy_reason,
            "decision": decision,
            "reason": reason,
        }


def _category_opt_in(notification: Notification) -> bool | None:
    if notification.type.value == "deadline_overdue":
        return notification.user.email_deadline_overdue
    if notification.type.value == "deadline_soon":
        minutes = int((notification.payload or {}).get("remind_before_minutes") or 0)
        return (
            notification.user.email_deadline_24h
            if minutes >= 1440
            else notification.user.email_deadline_1h
        )
    return None


def _is_protected(notification: Notification) -> bool:
    return bool(
        (notification.workspace is not None and notification.workspace.is_protected)
        or (notification.task is not None and notification.task.workspace.is_protected)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--notification-id", type=int, required=True)
    parser.add_argument(
        "--dry-run", action="store_true", help="Required acknowledgement; no email is sent."
    )
    args = parser.parse_args()
    if not args.dry_run:
        parser.error("--dry-run is required; this command never sends email")
    print(json.dumps(asyncio.run(diagnose(args.notification_id)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
