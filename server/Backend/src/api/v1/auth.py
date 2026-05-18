from fastapi import APIRouter, status

from src.api.deps import SessionDep
from src.models.user import User
from src.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from src.schemas.user import UserPublic
from src.services.auth import login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: SessionDep) -> User:
    return await register_user(session, payload)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: SessionDep) -> TokenResponse:
    return await login_user(session, payload)
