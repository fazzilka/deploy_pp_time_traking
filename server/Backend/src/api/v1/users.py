from fastapi import APIRouter, Query

from src.api.deps import CurrentUserDep, SessionDep
from src.schemas.user import ActivityResponse, UserProfile, UserUpdate
from src.services.user import get_activity, get_user_profile, update_user_profile

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


@router.get("/me/activity", response_model=ActivityResponse)
async def get_my_activity(
    session: SessionDep,
    current_user: CurrentUserDep,
    year: int | None = Query(default=None, ge=1970, le=9999),
) -> ActivityResponse:
    return await get_activity(session, current_user.id, year=year)
