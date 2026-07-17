from __future__ import annotations

import asyncio
import hmac
from datetime import UTC, datetime
from urllib.parse import urlencode
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.config import settings
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
        if (
            challenge is None
            or challenge.consumed_at is not None
            or challenge.expires_at <= datetime.now(UTC)
            or challenge.generation != generation
            or not hmac.compare_digest(
                challenge.verification_code_hash,
                hash_verification_code(verification_id, generation, code),
            )
        ):
            return
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
            return
        invitation, workspace, inviter = row
        if (
            invitation.status != WorkspaceInvitationStatus.PENDING
            or invitation.expires_at <= datetime.now(UTC)
            or invitation.email_generation != generation
            or invitation.token_hash != hash_invitation_token(token)
        ):
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
    try:
        send_result = await asyncio.to_thread(selected_provider.send, message)
    except EmailProviderError as exc:
        delivery.last_error_code = exc.code[:64]
        delivery.last_error = str(exc)[:500]
        delivery.status = (
            NotificationDeliveryStatus.FAILED
            if final_attempt or not exc.retryable
            else NotificationDeliveryStatus.QUEUED
        )
        delivery.failed_at = now if delivery.status == NotificationDeliveryStatus.FAILED else None
        await session.commit()
        if delivery.status == NotificationDeliveryStatus.QUEUED:
            raise RetryableEmailDeliveryError(exc.code) from exc
        return
    delivery.provider = send_result.provider
    delivery.provider_message_id = send_result.provider_message_id
    delivery.status = (
        NotificationDeliveryStatus.SENT
        if send_result.accepted
        else NotificationDeliveryStatus.SKIPPED
    )
    delivery.sent_at = now if send_result.accepted else None
    await session.commit()


async def _lock_delivery(
    session: AsyncSession,
    *,
    purpose: str,
    source_id: str,
    user_id: int | None,
    recipient: str,
    idempotency_key: str,
) -> NotificationDelivery:
    await session.execute(
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
    )
    result = await session.execute(
        select(NotificationDelivery)
        .where(NotificationDelivery.idempotency_key == idempotency_key)
        .with_for_update()
    )
    return result.scalar_one()
