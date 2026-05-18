from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.enums import UserRole
from src.models.task import Task
from src.models.user import User
from src.schemas.user import (
    ActivityResponse,
    AdminSystemStats,
    AdminUserListResponse,
    AdminUserRead,
    AdminUserStats,
    AdminUserUpdate,
    TopUserStats,
    UserProfile,
)
from src.services.auth import get_user_by_username
from src.services.user import get_activity, get_avatar_letter, get_user_profile


async def list_users(
    session: AsyncSession,
    *,
    search: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> AdminUserListResponse:
    filters = []
    if search:
        pattern = f"%{search}%"
        filters.append(
            or_(
                User.email.ilike(pattern),
                User.username.ilike(pattern),
                User.full_name.ilike(pattern),
            )
        )
    if role is not None:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active == is_active)

    total_stmt = select(func.count(User.id))
    users_stmt = select(User).order_by(User.id.asc()).limit(limit).offset(offset)
    if filters:
        total_stmt = total_stmt.where(*filters)
        users_stmt = users_stmt.where(*filters)

    total_result = await session.execute(total_stmt)
    users_result = await session.execute(users_stmt)
    users = list(users_result.scalars().all())
    return AdminUserListResponse(
        items=[await _build_admin_user(session, user) for user in users],
        total=int(total_result.scalar_one()),
    )


async def get_user_or_404(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


async def get_admin_user_profile(session: AsyncSession, user_id: int) -> UserProfile:
    user = await get_user_or_404(session, user_id)
    return await get_user_profile(session, user)


async def update_user_by_admin(
    session: AsyncSession,
    user_id: int,
    payload: AdminUserUpdate,
) -> UserProfile:
    user = await get_user_or_404(session, user_id)
    values = payload.model_dump(exclude_unset=True)
    username = values.get("username")
    if username is not None and username != user.username:
        existing = await get_user_by_username(session, username)
        if existing is not None and existing.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username уже занят",
            )
        user.username = username
    if "full_name" in values:
        user.full_name = values["full_name"]
    if "role" in values:
        user.role = values["role"]
    if "is_active" in values:
        user.is_active = values["is_active"]
    await session.commit()
    await session.refresh(user)
    return await get_user_profile(session, user)


async def get_system_stats(session: AsyncSession) -> AdminSystemStats:
    users_count = await _scalar_int(session, select(func.count(User.id)))
    active_users_count = await _scalar_int(
        session,
        select(func.count(User.id)).where(User.is_active.is_(True)),
    )
    admins_count = await _scalar_int(
        session,
        select(func.count(User.id)).where(User.role == UserRole.ADMIN),
    )
    tasks_count = await _scalar_int(session, select(func.count(Task.id)))
    total_time_seconds = await _scalar_int(
        session,
        select(func.coalesce(func.sum(Task.total_time_seconds), 0)),
    )
    top_users_result = await session.execute(
        select(User, func.coalesce(func.sum(Task.total_time_seconds), 0).label("total_time"))
        .outerjoin(Task, Task.user_id == User.id)
        .group_by(User.id)
        .order_by(desc("total_time"), User.id.asc())
        .limit(5)
    )
    top_users = [
        TopUserStats(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            avatar_letter=get_avatar_letter(user),
            total_time_seconds=int(total_time),
        )
        for user, total_time in top_users_result.all()
    ]
    return AdminSystemStats(
        users_count=users_count,
        active_users_count=active_users_count,
        admins_count=admins_count,
        tasks_count=tasks_count,
        total_time_seconds=total_time_seconds,
        top_users=top_users,
    )


async def get_user_activity_for_admin(
    session: AsyncSession,
    user_id: int,
    year: int | None,
) -> ActivityResponse:
    await get_user_or_404(session, user_id)
    return await get_activity(session, user_id, year=year)


async def _build_admin_user(session: AsyncSession, user: User) -> AdminUserRead:
    stats = await _build_admin_user_stats(session, user.id)
    return AdminUserRead.model_validate(
        {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "stats": stats,
        }
    )


async def _build_admin_user_stats(session: AsyncSession, user_id: int) -> AdminUserStats:
    tasks_count = await _scalar_int(
        session, select(func.count(Task.id)).where(Task.user_id == user_id)
    )
    total_time = await _scalar_int(
        session,
        select(func.coalesce(func.sum(Task.total_time_seconds), 0)).where(Task.user_id == user_id),
    )
    return AdminUserStats(tasks_count=tasks_count, total_time_seconds=total_time)


async def _scalar_int(session: AsyncSession, stmt: Select[tuple[Any]]) -> int:
    result = await session.execute(stmt)
    return int(result.scalar_one())
