import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.security import get_password_hash, verify_password
from src.models.enums import WorkspaceMemberStatus, WorkspaceRole, WorkspaceType
from src.models.protected_space import ProtectedSpaceSession, ProtectedSpaceSettings
from src.models.user import User
from src.models.workspace import Workspace, WorkspaceMember
from src.schemas.protected_space import (
    ProtectedSpaceChangePassword,
    ProtectedSpaceCreate,
    ProtectedSpaceRead,
    ProtectedSpaceStatus,
    ProtectedSpaceUnlock,
    ProtectedSpaceUnlockResponse,
)
from src.services.protected_context import get_request_vault_token
from src.services.user_events import publish_user_event

PROTECTED_SPACE_NAME = "Защищённое пространство 🔒"
VAULT_UNLOCK_TTL = timedelta(minutes=10)
VAULT_UNLOCK_MAX_TTL = timedelta(minutes=15)
VAULT_LOCKOUT_ATTEMPTS = 5
VAULT_LOCKOUT_TTL = timedelta(minutes=15)

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(UTC)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _access_denied() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Защищённое пространство заблокировано",
    )


async def get_protected_space_status(session: AsyncSession, user: User) -> ProtectedSpaceStatus:
    settings = await _get_settings_for_user(session, user.id)
    if settings is None:
        return ProtectedSpaceStatus(exists=False)

    active_session = await _get_active_session_for_request(
        session,
        user_id=user.id,
        workspace_id=settings.workspace_id,
    )
    return ProtectedSpaceStatus(
        exists=True,
        workspace_id=settings.workspace_id,
        is_unlocked=active_session is not None,
        expires_at=active_session.expires_at if active_session is not None else None,
    )


async def create_protected_space(
    session: AsyncSession,
    user: User,
    payload: ProtectedSpaceCreate,
) -> ProtectedSpaceRead:
    existing = await _get_settings_for_user(session, user.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Защищённое пространство уже создано",
        )

    workspace = Workspace(
        name=PROTECTED_SPACE_NAME,
        description=None,
        type=WorkspaceType.PERSONAL,
        is_protected=True,
        owner_id=user.id,
    )
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER,
            status=WorkspaceMemberStatus.ACTIVE,
        )
    )
    settings = ProtectedSpaceSettings(
        user_id=user.id,
        workspace_id=workspace.id,
        password_hash=get_password_hash(payload.password),
        is_enabled=True,
    )
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    logger.info(
        "protected_space_created",
        extra={"user_id": user.id, "workspace_id": workspace.id, "result": "success"},
    )
    await publish_user_event(
        user.id,
        "protected_space.changed",
        {"workspace_id": workspace.id, "reason": "created"},
    )
    return ProtectedSpaceRead(
        workspace_id=workspace.id,
        name=PROTECTED_SPACE_NAME,
        is_enabled=settings.is_enabled,
        created_at=settings.created_at,
    )


async def unlock_protected_space(
    session: AsyncSession,
    user: User,
    payload: ProtectedSpaceUnlock,
) -> ProtectedSpaceUnlockResponse:
    settings = await _get_settings_for_user_for_update(session, user.id)
    if settings is None or settings.is_enabled is False:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Защищённое пространство не найдено",
        )

    now = _now()
    if settings.locked_until is not None and settings.locked_until > now:
        logger.info(
            "protected_space_unlock_failed",
            extra={
                "user_id": user.id,
                "workspace_id": settings.workspace_id,
                "result": "locked_out",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Защищённое пространство временно заблокировано",
        )

    if not verify_password(payload.password, settings.password_hash):
        settings.failed_attempts += 1
        if settings.failed_attempts >= VAULT_LOCKOUT_ATTEMPTS:
            settings.locked_until = now + VAULT_LOCKOUT_TTL
        await session.commit()
        logger.info(
            "protected_space_unlock_failed",
            extra={
                "user_id": user.id,
                "workspace_id": settings.workspace_id,
                "result": "invalid_password",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Неверный защитный пароль",
        )

    raw_token = secrets.token_urlsafe(32)
    expires_at = now + VAULT_UNLOCK_TTL
    vault_session = ProtectedSpaceSession(
        user_id=user.id,
        workspace_id=settings.workspace_id,
        session_token_hash=_token_hash(raw_token),
        created_at=now,
        expires_at=expires_at,
        max_expires_at=now + VAULT_UNLOCK_MAX_TTL,
        last_activity_at=now,
    )
    settings.failed_attempts = 0
    settings.locked_until = None
    settings.last_unlocked_at = now
    session.add(vault_session)
    await session.commit()
    logger.info(
        "protected_space_unlocked",
        extra={"user_id": user.id, "workspace_id": settings.workspace_id, "result": "success"},
    )
    await publish_user_event(
        user.id,
        "protected_space.unlocked",
        {"workspace_id": settings.workspace_id},
    )
    return ProtectedSpaceUnlockResponse(
        workspace_id=settings.workspace_id,
        vault_token=raw_token,
        expires_at=expires_at,
    )


async def lock_protected_space(session: AsyncSession, user: User) -> None:
    settings = await _get_settings_for_user(session, user.id)
    if settings is None:
        return
    await revoke_protected_sessions(session, user_id=user.id, workspace_id=settings.workspace_id)
    await session.commit()
    logger.info(
        "protected_space_locked",
        extra={"user_id": user.id, "workspace_id": settings.workspace_id, "result": "manual"},
    )
    await publish_user_event(
        user.id,
        "protected_space.locked",
        {"workspace_id": settings.workspace_id},
    )


async def change_protected_space_password(
    session: AsyncSession,
    user: User,
    payload: ProtectedSpaceChangePassword,
) -> None:
    settings = await _get_settings_for_user_for_update(session, user.id)
    if settings is None or settings.is_enabled is False:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Защищённое пространство не найдено",
        )
    if not verify_password(payload.current_password, settings.password_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Неверный защитный пароль",
        )
    settings.password_hash = get_password_hash(payload.new_password)
    settings.password_changed_at = _now()
    settings.failed_attempts = 0
    settings.locked_until = None
    await revoke_protected_sessions(session, user_id=user.id, workspace_id=settings.workspace_id)
    await session.commit()
    logger.info(
        "protected_space_password_changed",
        extra={"user_id": user.id, "workspace_id": settings.workspace_id, "result": "success"},
    )
    await publish_user_event(
        user.id,
        "protected_space.locked",
        {"workspace_id": settings.workspace_id, "reason": "password_changed"},
    )


async def revoke_protected_sessions(
    session: AsyncSession,
    *,
    user_id: int,
    workspace_id: int | None = None,
) -> None:
    stmt = (
        update(ProtectedSpaceSession)
        .where(
            ProtectedSpaceSession.user_id == user_id,
            ProtectedSpaceSession.revoked_at.is_(None),
        )
        .values(revoked_at=_now())
    )
    if workspace_id is not None:
        stmt = stmt.where(ProtectedSpaceSession.workspace_id == workspace_id)
    await session.execute(stmt)


async def require_protected_space_unlocked(
    session: AsyncSession,
    *,
    user_id: int,
    workspace_id: int,
    token: str | None = None,
) -> None:
    active_session = await _get_active_session_for_request(
        session,
        user_id=user_id,
        workspace_id=workspace_id,
        token=token,
    )
    if active_session is None:
        raise _access_denied()


async def is_protected_space_unlocked(
    session: AsyncSession,
    *,
    user_id: int,
    workspace_id: int,
) -> bool:
    return (
        await _get_active_session_for_request(
            session,
            user_id=user_id,
            workspace_id=workspace_id,
        )
        is not None
    )


async def _get_active_session_for_request(
    session: AsyncSession,
    *,
    user_id: int,
    workspace_id: int,
    token: str | None = None,
) -> ProtectedSpaceSession | None:
    raw_token = token or get_request_vault_token()
    if not raw_token:
        return None
    now = _now()
    result = await session.execute(
        select(ProtectedSpaceSession).where(
            ProtectedSpaceSession.user_id == user_id,
            ProtectedSpaceSession.workspace_id == workspace_id,
            ProtectedSpaceSession.session_token_hash == _token_hash(raw_token),
            ProtectedSpaceSession.revoked_at.is_(None),
            ProtectedSpaceSession.expires_at > now,
            ProtectedSpaceSession.max_expires_at > now,
        )
    )
    vault_session = result.scalar_one_or_none()
    if vault_session is None:
        return None
    next_expires_at = min(now + VAULT_UNLOCK_TTL, vault_session.max_expires_at)
    vault_session.last_activity_at = now
    vault_session.expires_at = next_expires_at
    return vault_session


async def _get_settings_for_user(
    session: AsyncSession,
    user_id: int,
) -> ProtectedSpaceSettings | None:
    result = await session.execute(
        select(ProtectedSpaceSettings)
        .where(ProtectedSpaceSettings.user_id == user_id)
        .options(selectinload(ProtectedSpaceSettings.workspace))
    )
    return result.scalar_one_or_none()


async def _get_settings_for_user_for_update(
    session: AsyncSession,
    user_id: int,
) -> ProtectedSpaceSettings | None:
    result = await session.execute(
        select(ProtectedSpaceSettings)
        .where(ProtectedSpaceSettings.user_id == user_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()
