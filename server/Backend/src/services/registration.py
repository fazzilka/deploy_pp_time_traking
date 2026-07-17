from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.security import create_access_token, get_password_hash
from src.models.enums import (
    UserRole,
    WorkspaceInvitationStatus,
    WorkspaceMemberStatus,
    WorkspaceRole,
    WorkspaceType,
)
from src.models.invitation import WorkspaceInvitation
from src.models.registration import PendingRegistration
from src.models.user import User
from src.models.workspace import Workspace, WorkspaceMember
from src.schemas.auth import (
    RegisterRequest,
    RegistrationResendResponse,
    RegistrationStartResponse,
    TokenResponse,
)
from src.services.avatar import generate_avatar_seed
from src.services.identity import mask_email, normalize_email
from src.services.user import get_user_base_profile

INVALID_CODE_DETAIL = "Неверный или недействительный код"


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_verification_code(
    verification_id: UUID,
    generation: int,
    code: str,
) -> str:
    message = f"registration:{verification_id}:{generation}:{code}".encode()
    return hmac.new(settings.jwt_secret_key.encode(), message, hashlib.sha256).hexdigest()


async def start_registration(
    session: AsyncSession,
    payload: RegisterRequest,
    *,
    locale: str,
) -> RegistrationStartResponse:
    now = datetime.now(UTC)
    email = normalize_email(str(payload.email))
    password_hash = get_password_hash(payload.password)
    verification_id = uuid4()
    generation = 1
    code = generate_verification_code()

    conflict_result = await session.execute(
        select(User.id).where(or_(User.email == email, User.username == payload.username)).limit(1)
    )
    if conflict_result.scalar_one_or_none() is not None:
        return _start_response(verification_id, email)

    pending_result = await session.execute(
        select(PendingRegistration).where(PendingRegistration.email == email).with_for_update()
    )
    challenge = pending_result.scalar_one_or_none()
    if challenge is None:
        challenge = PendingRegistration(
            id=verification_id,
            email=email,
            username=payload.username,
            full_name=payload.full_name,
            password_hash=password_hash,
            verification_code_hash="",
            locale=_normalize_locale(locale),
            attempts=0,
            resend_count=0,
            generation=generation,
            expires_at=now,
            resend_available_at=now,
        )
        session.add(challenge)
    else:
        challenge.id = verification_id
        challenge.username = payload.username
        challenge.full_name = payload.full_name
        challenge.password_hash = password_hash
        challenge.locale = _normalize_locale(locale)
        challenge.attempts = 0
        challenge.resend_count = 0
        challenge.generation += 1
        generation = challenge.generation
        challenge.consumed_at = None

    challenge.verification_code_hash = hash_verification_code(
        verification_id,
        generation,
        code,
    )
    challenge.expires_at = now + timedelta(minutes=settings.email_verification_code_ttl_minutes)
    challenge.resend_available_at = now + timedelta(
        seconds=settings.email_verification_resend_cooldown_seconds
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return _start_response(uuid4(), email)

    enqueue_registration_verification_email(
        verification_id,
        generation,
        code,
    )
    return _start_response(verification_id, email)


async def verify_registration(
    session: AsyncSession,
    *,
    verification_id: UUID,
    code: str,
) -> TokenResponse:
    now = datetime.now(UTC)
    result = await session.execute(
        select(PendingRegistration)
        .where(PendingRegistration.id == verification_id)
        .with_for_update()
    )
    challenge = result.scalar_one_or_none()
    if challenge is None:
        _constant_time_dummy_compare(code)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CODE_DETAIL)
    if challenge.consumed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Регистрация уже завершена",
        )
    if challenge.attempts >= settings.email_verification_max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышено число попыток. Запросите новый код.",
        )
    if challenge.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Срок действия кода истёк")

    expected = hash_verification_code(challenge.id, challenge.generation, code)
    if not hmac.compare_digest(expected, challenge.verification_code_hash):
        challenge.attempts += 1
        await session.commit()
        if challenge.attempts >= settings.email_verification_max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Превышено число попыток. Запросите новый код.",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CODE_DETAIL)

    existing_result = await session.execute(
        select(User.id).where(
            or_(User.email == challenge.email, User.username == challenge.username)
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        challenge.consumed_at = now
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Не удалось завершить регистрацию",
        )

    user = User(
        email=challenge.email,
        username=challenge.username,
        full_name=challenge.full_name,
        hashed_password=challenge.password_hash,
        avatar_seed=generate_avatar_seed(),
        locale=challenge.locale,
        role=UserRole.USER,
        is_active=True,
        email_verified=True,
    )
    session.add(user)
    await session.flush()
    workspace = Workspace(
        name="Личное пространство" if challenge.locale == "ru" else "Personal workspace",
        type=WorkspaceType.PERSONAL,
        is_protected=False,
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
    await session.execute(
        update(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.invited_email == challenge.email,
            WorkspaceInvitation.invited_user_id.is_(None),
            WorkspaceInvitation.status == WorkspaceInvitationStatus.PENDING,
        )
        .values(invited_user_id=user.id)
    )
    challenge.consumed_at = now
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Не удалось завершить регистрацию",
        ) from exc
    await session.refresh(user)

    from src.services.invitation import create_pending_invitation_notifications

    await create_pending_invitation_notifications(session, user)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        user=get_user_base_profile(user),
    )


async def resend_registration_code(
    session: AsyncSession,
    *,
    verification_id: UUID,
) -> RegistrationResendResponse:
    now = datetime.now(UTC)
    result = await session.execute(
        select(PendingRegistration)
        .where(PendingRegistration.id == verification_id)
        .with_for_update()
    )
    challenge = result.scalar_one_or_none()
    if challenge is None or challenge.consumed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_CODE_DETAIL)
    if challenge.resend_available_at > now:
        retry_after = max(1, int((challenge.resend_available_at - now).total_seconds()))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Повторная отправка временно недоступна",
            headers={"Retry-After": str(retry_after)},
        )
    if challenge.resend_count >= settings.email_verification_max_resends:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышен лимит повторных отправок",
        )

    code = generate_verification_code()
    challenge.generation += 1
    challenge.resend_count += 1
    challenge.attempts = 0
    challenge.verification_code_hash = hash_verification_code(
        challenge.id,
        challenge.generation,
        code,
    )
    challenge.expires_at = now + timedelta(minutes=settings.email_verification_code_ttl_minutes)
    challenge.resend_available_at = now + timedelta(
        seconds=settings.email_verification_resend_cooldown_seconds
    )
    await session.commit()
    enqueue_registration_verification_email(challenge.id, challenge.generation, code)
    return RegistrationResendResponse(
        expires_in_seconds=settings.email_verification_code_ttl_minutes * 60,
        resend_available_in_seconds=settings.email_verification_resend_cooldown_seconds,
    )


def enqueue_registration_verification_email(
    verification_id: UUID,
    generation: int,
    code: str,
) -> None:
    if not settings.outbound_email_enabled:
        return
    from src.tasks.transactional_email import send_registration_verification_email

    send_registration_verification_email.apply_async(
        args=[str(verification_id), generation, code],
        argsrepr=f"('{verification_id}', {generation}, '<redacted>')",
    )


def _start_response(verification_id: UUID, email: str) -> RegistrationStartResponse:
    return RegistrationStartResponse(
        verification_id=verification_id,
        email_masked=mask_email(email),
        expires_in_seconds=settings.email_verification_code_ttl_minutes * 60,
        resend_available_in_seconds=settings.email_verification_resend_cooldown_seconds,
    )


def _constant_time_dummy_compare(code: str) -> None:
    dummy = hmac.new(
        settings.jwt_secret_key.encode(), b"registration:dummy", hashlib.sha256
    ).hexdigest()
    candidate = hmac.new(
        settings.jwt_secret_key.encode(), code.encode(), hashlib.sha256
    ).hexdigest()
    hmac.compare_digest(dummy, candidate)


def _normalize_locale(value: str) -> str:
    return "en" if value.lower().startswith("en") else "ru"
