from collections.abc import Callable
from time import perf_counter

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.metrics import observe_auth_login_duration, observe_auth_register_duration
from src.core.security import create_access_token, get_password_hash, verify_password
from src.models.enums import UserRole
from src.models.user import User
from src.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from src.services.avatar import generate_avatar_seed
from src.services.user import get_user_base_profile
from src.services.workspace import ensure_personal_workspace

AuthStageDurations = list[tuple[str, float]]
AuthDurationObserver = Callable[[str, str, float], None]
REGISTRATION_CONFLICT_DETAIL = "Email или username уже занят"


async def register_user(session: AsyncSession, payload: RegisterRequest) -> User:
    total_started_at = perf_counter()
    stage_durations: AuthStageDurations = []
    result = "failure"
    email = str(payload.email).strip().lower()

    try:
        stage_started_at = perf_counter()
        existing_users = await get_users_by_email_or_username(session, email, payload.username)
        stage_durations.append(("uniqueness_check", perf_counter() - stage_started_at))

        for existing_user in existing_users:
            if existing_user.email == email or existing_user.username == payload.username:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=REGISTRATION_CONFLICT_DETAIL,
                )

        stage_started_at = perf_counter()
        hashed_password = get_password_hash(payload.password)
        stage_durations.append(("password_hash", perf_counter() - stage_started_at))

        user = User(
            email=email,
            username=payload.username,
            full_name=payload.full_name,
            hashed_password=hashed_password,
            avatar_seed=generate_avatar_seed(),
            role=UserRole.USER,
            is_active=True,
        )

        stage_started_at = perf_counter()
        session.add(user)
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=REGISTRATION_CONFLICT_DETAIL,
            ) from exc
        await session.refresh(user)
        await ensure_personal_workspace(session, user)
        stage_durations.append(("db_insert", perf_counter() - stage_started_at))
        result = "success"
        return user
    finally:
        _observe_auth_stages(
            observe_auth_register_duration,
            stage_durations,
            result,
            perf_counter() - total_started_at,
        )


async def login_user(session: AsyncSession, payload: LoginRequest) -> TokenResponse:
    total_started_at = perf_counter()
    stage_durations: AuthStageDurations = []
    result = "failure"

    try:
        stage_started_at = perf_counter()
        user = await get_user_by_email(session, str(payload.email).strip().lower())
        stage_durations.append(("db_lookup", perf_counter() - stage_started_at))

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный email или пароль",
                headers={"WWW-Authenticate": "Bearer"},
            )

        stage_started_at = perf_counter()
        is_valid_password = verify_password(payload.password, user.hashed_password)
        stage_durations.append(("password_verify", perf_counter() - stage_started_at))

        if not is_valid_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный email или пароль",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь неактивен"
            )
        if user.email_verified is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email не подтверждён",
            )

        stage_started_at = perf_counter()
        access_token = create_access_token(user.id, user.role)
        stage_durations.append(("token_create", perf_counter() - stage_started_at))

        result = "success"
        return TokenResponse(
            access_token=access_token,
            user=get_user_base_profile(user),
        )
    finally:
        _observe_auth_stages(
            observe_auth_login_duration,
            stage_durations,
            result,
            perf_counter() - total_started_at,
        )


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_users_by_email_or_username(
    session: AsyncSession, email: str, username: str
) -> list[User]:
    result = await session.execute(
        select(User).where(or_(User.email == email, User.username == username))
    )
    return list(result.scalars().all())


def _observe_auth_stages(
    observer: AuthDurationObserver,
    stage_durations: AuthStageDurations,
    result: str,
    total_duration: float,
) -> None:
    for stage, duration in stage_durations:
        observer(stage, result, duration)
    observer("total", result, total_duration)
