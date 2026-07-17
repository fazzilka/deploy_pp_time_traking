from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from svix.webhooks import Webhook, WebhookVerificationError

from src.core.config import settings
from src.core.metrics import EMAIL_DELIVERY_EVENTS
from src.db.session import get_db_session
from src.models.enums import NotificationDeliveryStatus
from src.models.notification import NotificationDelivery, NotificationWebhookEvent
from src.models.user import User

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

KNOWN_RESEND_EVENTS = {
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.delivery_delayed",
    "email.failed",
    "email.suppressed",
}
PROVIDER_TERMINAL_STATUSES = {
    NotificationDeliveryStatus.BOUNCED,
    NotificationDeliveryStatus.COMPLAINED,
    NotificationDeliveryStatus.SUPPRESSED,
}


@router.post("/resend", status_code=status.HTTP_204_NO_CONTENT)
async def receive_resend_webhook(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    if not settings.resend_webhook_secret.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Resend webhook is not configured",
        )

    raw_body = await request.body()
    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    try:
        event = Webhook(settings.resend_webhook_secret).verify(raw_body, headers)
    except WebhookVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        ) from exc

    await _persist_resend_event(session, event, headers["svix-id"])
    response.status_code = status.HTTP_204_NO_CONTENT


async def _persist_resend_event(
    session: AsyncSession,
    event: Any,
    provider_event_id: str,
) -> None:
    if not isinstance(event, dict):
        return
    event_type = event.get("type")
    if not isinstance(event_type, str) or event_type not in KNOWN_RESEND_EVENTS:
        return
    if await _event_exists(session, provider_event_id):
        return

    webhook_event = NotificationWebhookEvent(
        provider="resend",
        provider_event_id=provider_event_id,
        event_type=event_type,
    )
    session.add(webhook_event)

    data = event.get("data")
    provider_message_id = data.get("email_id") if isinstance(data, dict) else None
    if isinstance(provider_message_id, str):
        delivery = await _load_delivery(session, provider_message_id)
        if delivery is not None:
            await _apply_delivery_event(session, delivery, event_type)

    webhook_event.processed_at = datetime.now(UTC)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return
    EMAIL_DELIVERY_EVENTS.labels(provider="resend", event=event_type).inc()


async def _event_exists(session: AsyncSession, provider_event_id: str) -> bool:
    result = await session.execute(
        select(NotificationWebhookEvent.id).where(
            NotificationWebhookEvent.provider == "resend",
            NotificationWebhookEvent.provider_event_id == provider_event_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _load_delivery(
    session: AsyncSession,
    provider_message_id: str,
) -> NotificationDelivery | None:
    result = await session.execute(
        select(NotificationDelivery)
        .where(
            NotificationDelivery.provider == "resend",
            NotificationDelivery.provider_message_id == provider_message_id,
        )
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def _apply_delivery_event(
    session: AsyncSession,
    delivery: NotificationDelivery,
    event_type: str,
) -> None:
    now = datetime.now(UTC)
    current = delivery.status
    if current in PROVIDER_TERMINAL_STATUSES:
        return

    if event_type == "email.sent":
        if current not in {NotificationDeliveryStatus.DELIVERED, NotificationDeliveryStatus.FAILED}:
            delivery.status = NotificationDeliveryStatus.SENT
            delivery.sent_at = delivery.sent_at or now
    elif event_type == "email.delivered":
        delivery.status = NotificationDeliveryStatus.DELIVERED
        delivery.delivered_at = now
    elif event_type == "email.bounced":
        delivery.status = NotificationDeliveryStatus.BOUNCED
        delivery.bounced_at = now
        await _suppress_user_email(session, delivery.user_id)
    elif event_type == "email.complained":
        delivery.status = NotificationDeliveryStatus.COMPLAINED
        delivery.complained_at = now
        await _suppress_user_email(session, delivery.user_id)
    elif event_type == "email.suppressed":
        delivery.status = NotificationDeliveryStatus.SUPPRESSED
        await _suppress_user_email(session, delivery.user_id)
    elif event_type == "email.failed":
        if current != NotificationDeliveryStatus.DELIVERED:
            delivery.status = NotificationDeliveryStatus.FAILED
            delivery.failed_at = now
            delivery.last_error_code = "provider_failed"
    elif event_type == "email.delivery_delayed":
        if current not in {NotificationDeliveryStatus.DELIVERED, NotificationDeliveryStatus.SENT}:
            delivery.status = NotificationDeliveryStatus.QUEUED


async def _suppress_user_email(session: AsyncSession, user_id: int | None) -> None:
    if user_id is None:
        return
    user = await session.get(User, user_id)
    if user is None:
        return
    user.email_notifications_enabled = False
    user.email_suppressed_at = datetime.now(UTC)
