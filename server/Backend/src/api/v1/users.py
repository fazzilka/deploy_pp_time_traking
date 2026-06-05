from fastapi import APIRouter, Query

from src.api.deps import CurrentUserDep, SessionDep
from src.schemas.user import (
    ActivityResponse,
    ChangePasswordRequest,
    ChangePasswordResponse,
    UserProfile,
    UserUpdate,
)
from src.services.user import change_password, get_activity, get_user_profile, update_user_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfile)
async def get_me(session: SessionDep, current_user: CurrentUserDep) -> UserProfile:
    return await get_user_profile(session, current_user)


@router.patch("/me", response_model=UserProfile)
async def update_me(
    payload: UserUpdate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> UserProfile:
    return await update_user_profile(session, current_user, payload)


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
    session: SessionDep,
    current_user: CurrentUserDep,
    year: int | None = Query(default=None, ge=1970, le=9999),
) -> ActivityResponse:
    return await get_activity(session, current_user.id, year=year)
