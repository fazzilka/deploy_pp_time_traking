from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import create_access_token, get_password_hash, verify_password
from src.models.enums import UserRole
from src.models.user import User
from src.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from src.services.user import get_user_profile


async def register_user(session: AsyncSession, payload: RegisterRequest) -> User:
    email = payload.email.lower()
    if await get_user_by_email(session, email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email уже занят")
    if await get_user_by_username(session, payload.username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username уже занят")

    user = User(
        email=email,
        username=payload.username,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role=UserRole.USER,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def login_user(session: AsyncSession, payload: LoginRequest) -> TokenResponse:
    user = await get_user_by_email(session, payload.email.lower())
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь неактивен")

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        user=await get_user_profile(session, user),
    )


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()
