from fastapi import APIRouter, Query, Response

from src.api.deps import CurrentUserDep, SessionDep
from src.schemas.user import (
    ActivityResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
    ProfileStats,
    UserProfileBase,
    UserUpdate,
)
from src.services.user import (
    change_password,
    get_activity,
    get_profile_stats,
    get_user_base_profile,
    regenerate_user_avatar_seed,
    update_user_profile,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileBase)
async def get_me(response: Response, current_user: CurrentUserDep) -> UserProfileBase:
    response.headers["Cache-Control"] = "private, max-age=60"
    return get_user_base_profile(current_user)


@router.get("/me/stats", response_model=ProfileStats)
async def get_my_stats(
    response: Response,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> ProfileStats:
    stats = await get_profile_stats(session, current_user.id)
    response.headers["Cache-Control"] = "private, max-age=15"
    return stats


@router.patch("/me", response_model=UserProfileBase)
async def update_me(
    payload: UserUpdate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> UserProfileBase:
    return await update_user_profile(session, current_user, payload)


@router.post("/me/avatar/regenerate", response_model=UserProfileBase)
async def regenerate_my_avatar(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> UserProfileBase:
    return await regenerate_user_avatar_seed(session, current_user)


@router.post("/me/change-password", response_model=ChangePasswordResponse)
async def change_my_password(
    payload: ChangePasswordRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> ChangePasswordResponse:
    await change_password(
        session,
        current_user,
        old_password=payload.old_password,
        new_password=payload.new_password,
    )
    return ChangePasswordResponse(message="Пароль успешно изменён")


@router.get("/me/activity", response_model=ActivityResponse)
async def get_my_activity(
    response: Response,
    session: SessionDep,
    current_user: CurrentUserDep,
    year: int | None = Query(default=None, ge=1970, le=9999),
) -> ActivityResponse:
    activity = await get_activity(session, current_user.id, year=year)
    response.headers["Cache-Control"] = "private, max-age=30"
    return activity
