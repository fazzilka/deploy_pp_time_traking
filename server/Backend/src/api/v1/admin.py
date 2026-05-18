from typing import Annotated

from fastapi import APIRouter, Query

from src.api.deps import CurrentAdminDep, SessionDep
from src.models.enums import UserRole
from src.schemas.user import (
    ActivityResponse,
    AdminSystemStats,
    AdminUserListResponse,
    AdminUserUpdate,
    UserProfile,
)
from src.services.admin import (
    get_admin_user_profile,
    get_system_stats,
    get_user_activity_for_admin,
    list_users,
    update_user_by_admin,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
async def get_users(
    session: SessionDep,
    _admin: CurrentAdminDep,
    search: Annotated[str | None, Query()] = None,
    role: Annotated[UserRole | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserListResponse:
    return await list_users(
        session,
        search=search,
        role=role,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )


@router.get("/users/{user_id}", response_model=UserProfile)
async def get_user(
    user_id: int,
    session: SessionDep,
    _admin: CurrentAdminDep,
) -> UserProfile:
    return await get_admin_user_profile(session, user_id)


@router.patch("/users/{user_id}", response_model=UserProfile)
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    session: SessionDep,
    _admin: CurrentAdminDep,
) -> UserProfile:
    return await update_user_by_admin(session, user_id, payload)


@router.get("/users/{user_id}/activity", response_model=ActivityResponse)
async def get_user_activity(
    user_id: int,
    session: SessionDep,
    _admin: CurrentAdminDep,
    year: Annotated[int | None, Query(ge=1970, le=9999)] = None,
) -> ActivityResponse:
    return await get_user_activity_for_admin(session, user_id, year)


@router.get("/stats", response_model=AdminSystemStats)
async def get_stats(session: SessionDep, _admin: CurrentAdminDep) -> AdminSystemStats:
    return await get_system_stats(session)
