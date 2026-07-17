from __future__ import annotations

import asyncio
import hmac
import logging
from datetime import UTC, datetime
from time import perf_counter
from urllib.parse import urlencode
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.config import settings
from src.core.metrics import (
    EMAIL_DELIVERY_FAILED,
    EMAIL_DELIVERY_PENDING,
    EMAIL_DELIVERY_SKIPPED,
    EMAIL_SEND_ATTEMPTS,
    EMAIL_SEND_DURATION,
)
from src.models.enums import (
    NotificationDeliveryChannel,
    NotificationDeliveryStatus,
    WorkspaceInvitationStatus,
)
from src.models.invitation import WorkspaceInvitation
from src.models.notification import NotificationDelivery
from src.models.registration import PendingRegistration
from src.models.user import User
from src.models.workspace import Workspace
from src.services.email_delivery import TERMINAL_EMAIL_STATUSES, RetryableEmailDeliveryError
from src.services.email_provider import (
    EmailMessage,
    EmailProvider,
    EmailProviderError,
    format_sender,
    get_email_provider,
)
from src.services.email_templates import (
    RenderedEmail,
    render_registration_verification_email,
    render_workspace_invitation_email,
)
from src.services.invitation import hash_invitation_token
from src.services.registration import hash_verification_code

logger = logging.getLogger(__name__)


async def deliver_registration_verification_email(
    session_factory: async_sessionmaker[AsyncSession],
    verification_id: UUID,
    generation: int,
    code: str,
    *,
    final_attempt: bool,
    provider: EmailProvider | None = None,
) -> None:
    async with session_factory() as session:
        result = await session.execute(
            select(PendingRegistration).where(PendingRegistration.id == verification_id)
        )
        challenge = result.scalar_one_or_none()
        skip_reason = _registration_skip_reason(challenge, verification_id, generation, code)
        if skip_reason is not None:
            _log_precondition_skip(
                purpose="registration_verification",
                source_id=str(verification_id),
                reason=skip_reason,
            )
            return
        assert challenge is not None
        rendered = render_registration_verification_email(
            code=code,
            locale=challenge.locale,
            ttl_minutes=settings.email_verification_code_ttl_minutes,
        )
        await _deliver_transactional(
            session,
            purpose="registration_verification",
            source_id=str(verification_id),
            generation=generation,
            recipient=challenge.email,
            user_id=None,
            rendered=rendered,
            final_attempt=final_attempt,
            provider=provider,
        )


async def deliver_workspace_invitation_email(
    session_factory: async_sessionmaker[AsyncSession],
    invitation_id: UUID,
    generation: int,
    token: str,
    *,
    final_attempt: bool,
    provider: EmailProvider | None = None,
) -> None:
    async with session_factory() as session:
        result = await session.execute(
            select(WorkspaceInvitation, Workspace, User)
            .join(Workspace, Workspace.id == WorkspaceInvitation.workspace_id)
            .join(User, User.id == WorkspaceInvitation.invited_by_user_id)
            .where(WorkspaceInvitation.id == invitation_id)
        )
        row = result.one_or_none()
        if row is None:
            _log_precondition_skip(
                purpose="workspace_invitation",
                source_id=str(invitation_id),
                reason="source_missing",
            )
            return
        invitation, workspace, inviter = row
        skip_reason = _invitation_skip_reason(invitation, generation, token)
        if skip_reason is not None:
            _log_precondition_skip(
                purpose="workspace_invitation",
                source_id=str(invitation_id),
                reason=skip_reason,
            )
            return
        invited_user = (
            await session.get(User, invitation.invited_user_id)
            if invitation.invited_user_id is not None
            else None
        )
        locale = invited_user.locale if invited_user is not None else settings.email_default_locale
        invitation_url = f"{settings.email_base_url.rstrip('/')}/invitations/accept?" + urlencode(
            {"token": token}
        )
        rendered = render_workspace_invitation_email(
            locale=locale,
            inviter_name=inviter.full_name or inviter.username,
            workspace_name=workspace.name,
            expires_at=invitation.expires_at,
            invitation_url=invitation_url,
            timezone_name=settings.app_timezone,
        )
        await _deliver_transactional(
            session,
            purpose="workspace_invitation",
            source_id=str(invitation.id),
            generation=generation,
            recipient=invitation.invited_email,
            user_id=invitation.invited_user_id,
            rendered=rendered,
            final_attempt=final_attempt,
            provider=provider,
        )


async def _deliver_transactional(
    session: AsyncSession,
    *,
    purpose: str,
    source_id: str,
    generation: int,
    recipient: str,
    user_id: int | None,
    rendered: RenderedEmail,
    final_attempt: bool,
    provider: EmailProvider | None,
) -> None:
    idempotency_key = f"{purpose.replace('_', '-')}:{source_id}:{generation}:email:v1"
    delivery = await _lock_delivery(
        session,
        purpose=purpose,
        source_id=source_id,
        user_id=user_id,
        recipient=recipient,
        idempotency_key=idempotency_key,
    )
    if delivery.status in TERMINAL_EMAIL_STATUSES:
        return
    if not settings.outbound_email_enabled:
        delivery.status = NotificationDeliveryStatus.SKIPPED
        delivery.last_error_code = "email_disabled"
        await session.commit()
        EMAIL_DELIVERY_SKIPPED.labels(
            provider=settings.configured_email_provider,
            purpose=purpose,
            reason="email_disabled",
        ).inc()
        logger.info(
            "email_delivery_skipped",
            extra=_delivery_log_fields(delivery, purpose=purpose, skip_code="email_disabled"),
        )
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
        recipient=recipient,
        sender=format_sender(sender_name, sender_email),
        subject=rendered.subject,
        html=rendered.html,
        text=rendered.text,
        idempotency_key=idempotency_key,
        reply_to=settings.email_reply_to or None,
        tags={"purpose": purpose, "source": source_id, "generation": str(generation)},
    )
    now = datetime.now(UTC)
    delivery.status = NotificationDeliveryStatus.SENDING
    delivery.sending_at = now
    delivery.attempts += 1
    delivery.provider = selected_provider.name
    delivery.last_error = None
    delivery.last_error_code = None
    logger.info(
        "email_delivery_sending",
        extra=_delivery_log_fields(delivery, purpose=purpose, provider=selected_provider.name),
    )
    EMAIL_DELIVERY_PENDING.inc()
    started_at = perf_counter()
    try:
        send_result = await asyncio.to_thread(selected_provider.send, message)
    except EmailProviderError as exc:
        EMAIL_SEND_DURATION.labels(provider=selected_provider.name).observe(
            perf_counter() - started_at
        )
        EMAIL_SEND_ATTEMPTS.labels(provider=selected_provider.name, status="failed").inc()
        delivery.last_error_code = exc.code[:64]
        delivery.last_error = str(exc)[:500]
        delivery.status = (
            NotificationDeliveryStatus.FAILED
            if final_attempt or not exc.retryable
            else NotificationDeliveryStatus.QUEUED
        )
        delivery.failed_at = now if delivery.status == NotificationDeliveryStatus.FAILED else None
        await session.commit()
        EMAIL_DELIVERY_PENDING.dec()
        if delivery.status == NotificationDeliveryStatus.QUEUED:
            logger.info(
                "email_delivery_retry",
                extra=_delivery_log_fields(
                    delivery,
                    purpose=purpose,
                    provider=selected_provider.name,
                    error_code=exc.code,
                ),
            )
            raise RetryableEmailDeliveryError(exc.code) from exc
        EMAIL_DELIVERY_FAILED.inc()
        logger.warning(
            "email_delivery_failed",
            extra=_delivery_log_fields(
                delivery,
                purpose=purpose,
                provider=selected_provider.name,
                error_code=exc.code,
            ),
        )
        return
    EMAIL_SEND_DURATION.labels(provider=selected_provider.name).observe(perf_counter() - started_at)
    EMAIL_SEND_ATTEMPTS.labels(
        provider=selected_provider.name,
        status="accepted" if send_result.accepted else "rejected",
    ).inc()
    delivery.provider = send_result.provider
    delivery.provider_message_id = send_result.provider_message_id
    delivery.status = (
        NotificationDeliveryStatus.SENT
        if send_result.accepted
        else NotificationDeliveryStatus.FAILED
    )
    delivery.sent_at = now if send_result.accepted else None
    delivery.failed_at = None if send_result.accepted else now
    delivery.last_error_code = None if send_result.accepted else "provider_rejected"
    await session.commit()
    EMAIL_DELIVERY_PENDING.dec()
    if not send_result.accepted:
        EMAIL_DELIVERY_FAILED.inc()
    log_method = logger.info if send_result.accepted else logger.warning
    log_method(
        "email_delivery_sent" if send_result.accepted else "email_delivery_failed",
        extra=_delivery_log_fields(
            delivery,
            purpose=purpose,
            provider=send_result.provider,
            error_code=delivery.last_error_code,
        ),
    )


async def _lock_delivery(
    session: AsyncSession,
    *,
    purpose: str,
    source_id: str,
    user_id: int | None,
    recipient: str,
    idempotency_key: str,
) -> NotificationDelivery:
    insert_result = await session.execute(
        insert(NotificationDelivery)
        .values(
            notification_id=None,
            user_id=user_id,
            channel=NotificationDeliveryChannel.EMAIL.value,
            status=NotificationDeliveryStatus.QUEUED.value,
            purpose=purpose,
            source_id=source_id,
            recipient_email=recipient,
            provider=settings.configured_email_provider,
            idempotency_key=idempotency_key,
            queued_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
        .returning(NotificationDelivery.id)
    )
    created_id = insert_result.scalar_one_or_none()
    result = await session.execute(
        select(NotificationDelivery)
        .where(NotificationDelivery.idempotency_key == idempotency_key)
        .with_for_update()
    )
    delivery = result.scalar_one()
    if created_id is not None:
        logger.info(
            "email_delivery_created",
            extra=_delivery_log_fields(delivery, purpose=purpose),
        )
    return delivery


def _delivery_log_fields(
    delivery: NotificationDelivery,
    *,
    purpose: str,
    provider: str | None = None,
    skip_code: str | None = None,
    error_code: str | None = None,
) -> dict[str, object]:
    return {
        "delivery_id": delivery.id,
        "notification_id": None,
        "purpose": purpose,
        "notification_type": None,
        "provider": provider or delivery.provider or settings.configured_email_provider,
        "user_id": delivery.user_id,
        "attempt": delivery.attempts,
        "skip_code": skip_code,
        "error_code": error_code,
    }


def _registration_skip_reason(
    challenge: PendingRegistration | None,
    verification_id: UUID,
    generation: int,
    code: str,
) -> str | None:
    if challenge is None:
        return "source_missing"
    if challenge.consumed_at is not None:
        return "verification_consumed"
    if challenge.expires_at <= datetime.now(UTC):
        return "verification_expired"
    if challenge.generation != generation:
        return "stale_generation"
    if not hmac.compare_digest(
        challenge.verification_code_hash,
        hash_verification_code(verification_id, generation, code),
    ):
        return "stale_generation"
    return None


def _invitation_skip_reason(
    invitation: WorkspaceInvitation,
    generation: int,
    token: str,
) -> str | None:
    if invitation.status != WorkspaceInvitationStatus.PENDING:
        return "invitation_not_pending"
    if invitation.expires_at <= datetime.now(UTC):
        return "invitation_expired"
    if invitation.email_generation != generation:
        return "stale_generation"
    if invitation.token_hash != hash_invitation_token(token):
        return "stale_generation"
    return None


def _log_precondition_skip(*, purpose: str, source_id: str, reason: str) -> None:
    EMAIL_DELIVERY_SKIPPED.labels(
        provider=settings.configured_email_provider,
        purpose=purpose,
        reason=reason,
    ).inc()
    logger.info(
        "email_delivery_skipped",
        extra={
            "delivery_id": None,
            "notification_id": None,
            "purpose": purpose,
            "notification_type": None,
            "provider": settings.configured_email_provider,
            "source_id": source_id,
            "user_id": None,
            "attempt": 0,
            "skip_code": reason,
            "error_code": None,
        },
    )
