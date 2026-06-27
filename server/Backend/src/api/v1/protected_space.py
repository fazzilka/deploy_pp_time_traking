from fastapi import APIRouter, Response, status

from src.api.deps import CurrentUserDep, SessionDep
from src.schemas.protected_space import (
    ProtectedSpaceChangePassword,
    ProtectedSpaceCreate,
    ProtectedSpaceMessage,
    ProtectedSpaceRead,
    ProtectedSpaceStatus,
    ProtectedSpaceUnlock,
    ProtectedSpaceUnlockResponse,
)
from src.services.protected_space import (
    change_protected_space_password,
    create_protected_space,
    get_protected_space_status,
    lock_protected_space,
    unlock_protected_space,
)

router = APIRouter(prefix="/protected-space", tags=["protected-space"])


@router.post("", response_model=ProtectedSpaceRead, status_code=status.HTTP_201_CREATED)
async def post_protected_space(
    payload: ProtectedSpaceCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> ProtectedSpaceRead:
    return await create_protected_space(session, current_user, payload)


@router.get("/status", response_model=ProtectedSpaceStatus)
async def get_status(session: SessionDep, current_user: CurrentUserDep) -> ProtectedSpaceStatus:
    return await get_protected_space_status(session, current_user)


@router.post("/unlock", response_model=ProtectedSpaceUnlockResponse)
async def post_unlock(
    payload: ProtectedSpaceUnlock,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> ProtectedSpaceUnlockResponse:
    return await unlock_protected_space(session, current_user, payload)


@router.post("/lock", status_code=status.HTTP_204_NO_CONTENT)
async def post_lock(session: SessionDep, current_user: CurrentUserDep) -> Response:
    await lock_protected_space(session, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/change-password", response_model=ProtectedSpaceMessage)
async def post_change_password(
    payload: ProtectedSpaceChangePassword,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> ProtectedSpaceMessage:
    await change_protected_space_password(session, current_user, payload)
    return ProtectedSpaceMessage(detail="Защитный пароль изменён")
