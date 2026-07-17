from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.models.enums import (
    NotificationType,
    WorkspaceInvitationStatus,
    WorkspaceMemberStatus,
    WorkspaceRole,
)
from src.models.invitation import WorkspaceInvitation
from src.models.notification import Notification
from src.models.user import User
from src.models.workspace import Workspace, WorkspaceMember
from src.schemas.invitation import InvitationResolveResponse, WorkspaceInvitationCreate
from src.services.identity import mask_email, normalize_email
from src.services.notification import create_notification
from src.services.user_events import publish_user_event, publish_workspace_event
from src.services.workspace import MEMBER_MANAGEMENT_ROLES, require_workspace_role

logger = logging.getLogger(__name__)


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(32)


def hash_invitation_token(token: str) -> str:
    return hmac.new(
        settings.jwt_secret_key.encode(),
        f"workspace-invitation:{token}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def create_workspace_invitation(
    session: AsyncSession,
    actor: User,
    workspace_id: int,
    payload: WorkspaceInvitationCreate,
) -> WorkspaceInvitation:
    actor_membership = await require_workspace_role(
        session,
        actor.id,
        workspace_id,
        MEMBER_MANAGEMENT_ROLES,
    )
    workspace = actor_membership.workspace
    if workspace.is_protected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Защищённое пространство не поддерживает приглашения",
        )
    _validate_invited_role(actor_membership.role, payload.role)

    email = normalize_email(str(payload.email))
    membership_result = await session.execute(
        select(WorkspaceMember.id)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id, User.email == email)
    )
    if membership_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь уже состоит в команде",
        )

    user_result = await session.execute(select(User).where(User.email == email))
    invited_user = user_result.scalar_one_or_none()
    now = datetime.now(UTC)
    raw_token = generate_invitation_token()
    token_hash = hash_invitation_token(raw_token)
    pending_result = await session.execute(
        select(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.workspace_id == workspace_id,
            WorkspaceInvitation.invited_email == email,
            WorkspaceInvitation.status == WorkspaceInvitationStatus.PENDING,
        )
        .with_for_update()
    )
    invitation = pending_result.scalar_one_or_none()
    if invitation is None:
        invitation = WorkspaceInvitation(
            id=uuid4(),
            workspace_id=workspace_id,
            invited_email=email,
            invited_user_id=invited_user.id if invited_user is not None else None,
            invited_by_user_id=actor.id,
            role=payload.role,
            status=WorkspaceInvitationStatus.PENDING,
            token_hash=token_hash,
            email_generation=1,
            expires_at=now + timedelta(days=settings.workspace_invitation_ttl_days),
        )
        session.add(invitation)
    else:
        invitation.invited_user_id = invited_user.id if invited_user is not None else None
        invitation.invited_by_user_id = actor.id
        invitation.role = payload.role
        invitation.token_hash = token_hash
        invitation.email_generation += 1
        invitation.expires_at = now + timedelta(days=settings.workspace_invitation_ttl_days)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        duplicate_result = await session.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.invited_email == email,
                WorkspaceInvitation.status == WorkspaceInvitationStatus.PENDING,
            )
        )
        duplicate = duplicate_result.scalar_one_or_none()
        if duplicate is not None:
            return duplicate
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Приглашение уже существует",
        ) from exc
    await session.refresh(invitation)

    if invited_user is not None and invited_user.is_active:
        await create_invitation_notification(
            session,
            invitation,
            invited_user,
            workspace_name=workspace.name,
            inviter=actor,
        )
    enqueue_workspace_invitation_email(invitation, raw_token)
    return invitation


async def list_user_invitations(session: AsyncSession, user: User) -> list[WorkspaceInvitation]:
    now = datetime.now(UTC)
    result = await session.execute(
        select(WorkspaceInvitation)
        .where(
            or_(
                WorkspaceInvitation.invited_user_id == user.id,
                WorkspaceInvitation.invited_email == normalize_email(user.email),
            ),
            WorkspaceInvitation.status == WorkspaceInvitationStatus.PENDING,
            WorkspaceInvitation.expires_at > now,
        )
        .order_by(WorkspaceInvitation.created_at.desc())
    )
    return list(result.scalars().all())


async def list_workspace_invitations(
    session: AsyncSession,
    actor: User,
    workspace_id: int,
) -> list[WorkspaceInvitation]:
    await require_workspace_role(session, actor.id, workspace_id, MEMBER_MANAGEMENT_ROLES)
    result = await session.execute(
        select(WorkspaceInvitation)
        .where(WorkspaceInvitation.workspace_id == workspace_id)
        .order_by(WorkspaceInvitation.created_at.desc())
    )
    return list(result.scalars().all())


async def resolve_invitation(session: AsyncSession, token: str) -> InvitationResolveResponse:
    if len(token) < 32 or len(token) > 256:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Приглашение не найдено")
    result = await session.execute(
        select(WorkspaceInvitation, Workspace, User)
        .join(Workspace, Workspace.id == WorkspaceInvitation.workspace_id)
        .join(User, User.id == WorkspaceInvitation.invited_by_user_id)
        .where(WorkspaceInvitation.token_hash == hash_invitation_token(token))
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Приглашение не найдено")
    invitation, workspace, inviter = row
    invitation_status = invitation.status
    if (
        invitation_status == WorkspaceInvitationStatus.PENDING
        and invitation.expires_at <= datetime.now(UTC)
    ):
        invitation_status = WorkspaceInvitationStatus.EXPIRED
    return InvitationResolveResponse(
        id=invitation.id,
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        invited_email_masked=mask_email(invitation.invited_email),
        invited_by_display_name=inviter.full_name or inviter.username,
        role=invitation.role,
        status=invitation_status,
        expires_at=invitation.expires_at,
    )


async def accept_invitation(
    session: AsyncSession,
    user: User,
    invitation_id: UUID,
) -> WorkspaceInvitation:
    invitation = await _load_invitation_for_update(session, invitation_id)
    now = datetime.now(UTC)
    await _mark_expired_and_raise(session, invitation, now)
    _require_pending_invitation(invitation, now)
    if normalize_email(user.email) != invitation.invited_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Приглашение предназначено для другого аккаунта",
        )
    existing_result = await session.execute(
        select(WorkspaceMember.id).where(
            WorkspaceMember.workspace_id == invitation.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь уже состоит в команде",
        )

    session.add(
        WorkspaceMember(
            workspace_id=invitation.workspace_id,
            user_id=user.id,
            role=invitation.role,
            status=WorkspaceMemberStatus.ACTIVE,
        )
    )
    invitation.invited_user_id = user.id
    invitation.status = WorkspaceInvitationStatus.ACCEPTED
    invitation.accepted_at = now
    await _finish_invitation_notifications(
        session,
        invitation.id,
        WorkspaceInvitationStatus.ACCEPTED,
        now,
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Приглашение уже обработано",
        ) from exc
    await session.refresh(invitation)
    await publish_user_event(
        user.id,
        "workspace.membership.changed",
        {"reason": "invitation_accepted", "workspace_id": invitation.workspace_id},
    )
    await publish_user_event(
        user.id,
        "notifications.changed",
        {"invitation_id": str(invitation.id)},
    )
    await publish_workspace_event(
        session,
        invitation.workspace_id,
        "workspace_member_added",
        {"user_id": user.id},
    )
    return invitation


async def decline_invitation(
    session: AsyncSession,
    user: User,
    invitation_id: UUID,
) -> WorkspaceInvitation:
    invitation = await _load_invitation_for_update(session, invitation_id)
    now = datetime.now(UTC)
    await _mark_expired_and_raise(session, invitation, now)
    _require_pending_invitation(invitation, now)
    if normalize_email(user.email) != invitation.invited_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Приглашение предназначено для другого аккаунта",
        )
    invitation.invited_user_id = user.id
    invitation.status = WorkspaceInvitationStatus.DECLINED
    invitation.declined_at = now
    await _finish_invitation_notifications(
        session,
        invitation.id,
        WorkspaceInvitationStatus.DECLINED,
        now,
    )
    await session.commit()
    await session.refresh(invitation)
    await publish_user_event(
        user.id,
        "notifications.changed",
        {"invitation_id": str(invitation.id)},
    )
    return invitation


async def revoke_invitation(
    session: AsyncSession,
    actor: User,
    workspace_id: int,
    invitation_id: UUID,
) -> WorkspaceInvitation:
    await require_workspace_role(session, actor.id, workspace_id, MEMBER_MANAGEMENT_ROLES)
    invitation = await _load_invitation_for_update(session, invitation_id, workspace_id)
    await _mark_expired_and_raise(session, invitation, datetime.now(UTC))
    _require_pending_invitation(invitation, datetime.now(UTC))
    invitation.status = WorkspaceInvitationStatus.REVOKED
    invitation.revoked_at = datetime.now(UTC)
    await _finish_invitation_notifications(
        session,
        invitation.id,
        WorkspaceInvitationStatus.REVOKED,
        invitation.revoked_at,
    )
    await session.commit()
    await session.refresh(invitation)
    if invitation.invited_user_id is not None:
        await publish_user_event(
            invitation.invited_user_id,
            "notifications.changed",
            {"invitation_id": str(invitation.id)},
        )
    return invitation


async def resend_invitation(
    session: AsyncSession,
    actor: User,
    workspace_id: int,
    invitation_id: UUID,
) -> WorkspaceInvitation:
    await require_workspace_role(session, actor.id, workspace_id, MEMBER_MANAGEMENT_ROLES)
    invitation = await _load_invitation_for_update(session, invitation_id, workspace_id)
    _require_pending_invitation(invitation, datetime.now(UTC), allow_expired=True)
    token = generate_invitation_token()
    invitation.token_hash = hash_invitation_token(token)
    invitation.email_generation += 1
    invitation.expires_at = datetime.now(UTC) + timedelta(
        days=settings.workspace_invitation_ttl_days
    )
    invitation.status = WorkspaceInvitationStatus.PENDING
    await session.commit()
    await session.refresh(invitation)
    if invitation.invited_user_id is not None:
        recipient = await session.get(User, invitation.invited_user_id)
        workspace = await session.get(Workspace, invitation.workspace_id)
        inviter = await session.get(User, invitation.invited_by_user_id)
        if (
            recipient is not None
            and recipient.is_active
            and workspace is not None
            and inviter is not None
        ):
            await create_invitation_notification(
                session,
                invitation,
                recipient,
                workspace_name=workspace.name,
                inviter=inviter,
            )
    enqueue_workspace_invitation_email(invitation, token)
    return invitation


async def create_pending_invitation_notifications(session: AsyncSession, user: User) -> None:
    result = await session.execute(
        select(WorkspaceInvitation, Workspace, User)
        .join(Workspace, Workspace.id == WorkspaceInvitation.workspace_id)
        .join(User, User.id == WorkspaceInvitation.invited_by_user_id)
        .where(
            WorkspaceInvitation.invited_email == normalize_email(user.email),
            WorkspaceInvitation.status == WorkspaceInvitationStatus.PENDING,
            WorkspaceInvitation.expires_at > datetime.now(UTC),
        )
    )
    for invitation, workspace, inviter in result.all():
        await create_invitation_notification(
            session,
            invitation,
            user,
            workspace_name=workspace.name,
            inviter=inviter,
        )


async def create_invitation_notification(
    session: AsyncSession,
    invitation: WorkspaceInvitation,
    recipient: User,
    *,
    workspace_name: str,
    inviter: User,
) -> None:
    inviter_name = inviter.full_name or inviter.username
    notification = await create_notification(
        session,
        user_id=recipient.id,
        workspace_id=invitation.workspace_id,
        invitation_id=invitation.id,
        type=NotificationType.WORKSPACE_INVITATION,
        title="Приглашение в команду",
        message=f"{inviter_name} приглашает вас присоединиться к пространству «{workspace_name}».",
        payload={
            "invitation_id": str(invitation.id),
            "workspace_id": invitation.workspace_id,
            "workspace_name": workspace_name,
            "invited_by_user_id": inviter.id,
            "invited_by_display_name": inviter_name,
            "role": invitation.role.value,
            "expires_at": invitation.expires_at.isoformat(),
            "status": invitation.status.value,
        },
        dedupe_key=f"workspace_invitation:{invitation.id}:user:{recipient.id}",
    )
    if notification is not None:
        await publish_user_event(
            recipient.id,
            "notifications.changed",
            {"notification_id": notification.id, "invitation_id": str(invitation.id)},
        )
        return

    existing_result = await session.execute(
        select(Notification).where(
            Notification.invitation_id == invitation.id,
            Notification.user_id == recipient.id,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        existing.title = "Приглашение в команду"
        existing.message = (
            f"{inviter_name} приглашает вас присоединиться к пространству «{workspace_name}»."
        )
        existing.payload = {
            **(existing.payload or {}),
            "expires_at": invitation.expires_at.isoformat(),
            "role": invitation.role.value,
            "status": WorkspaceInvitationStatus.PENDING.value,
        }
        existing.is_read = False
        existing.read_at = None
        await session.commit()
        await publish_user_event(
            recipient.id,
            "notifications.changed",
            {"notification_id": existing.id, "invitation_id": str(invitation.id)},
        )


def enqueue_workspace_invitation_email(invitation: WorkspaceInvitation, token: str) -> None:
    if not settings.outbound_email_enabled:
        return
    from src.tasks.transactional_email import send_workspace_invitation_email

    send_workspace_invitation_email.apply_async(
        args=[str(invitation.id), invitation.email_generation, token],
        argsrepr=f"('{invitation.id}', {invitation.email_generation}, '<redacted>')",
    )


async def _load_invitation_for_update(
    session: AsyncSession,
    invitation_id: UUID,
    workspace_id: int | None = None,
) -> WorkspaceInvitation:
    query = select(WorkspaceInvitation).where(WorkspaceInvitation.id == invitation_id)
    if workspace_id is not None:
        query = query.where(WorkspaceInvitation.workspace_id == workspace_id)
    result = await session.execute(query.with_for_update())
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Приглашение не найдено")
    return invitation


def _require_pending_invitation(
    invitation: WorkspaceInvitation,
    now: datetime,
    *,
    allow_expired: bool = False,
) -> None:
    if invitation.status != WorkspaceInvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Приглашение уже обработано или отозвано",
        )
    if invitation.expires_at <= now and not allow_expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Приглашение истекло")


async def _mark_expired_and_raise(
    session: AsyncSession,
    invitation: WorkspaceInvitation,
    now: datetime,
) -> None:
    if invitation.status == WorkspaceInvitationStatus.PENDING and invitation.expires_at <= now:
        invitation.status = WorkspaceInvitationStatus.EXPIRED
        await _finish_invitation_notifications(
            session,
            invitation.id,
            WorkspaceInvitationStatus.EXPIRED,
            now,
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Приглашение истекло")


def _validate_invited_role(actor_role: WorkspaceRole, invited_role: WorkspaceRole) -> None:
    if invited_role == WorkspaceRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if actor_role == WorkspaceRole.TEAM_LEAD and invited_role == WorkspaceRole.TEAM_LEAD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


async def _finish_invitation_notifications(
    session: AsyncSession,
    invitation_id: UUID,
    final_status: WorkspaceInvitationStatus,
    now: datetime,
) -> None:
    result = await session.execute(
        select(Notification).where(Notification.invitation_id == invitation_id).with_for_update()
    )
    for notification in result.scalars().all():
        notification.payload = {**(notification.payload or {}), "status": final_status.value}
        notification.is_read = True
        notification.read_at = now
