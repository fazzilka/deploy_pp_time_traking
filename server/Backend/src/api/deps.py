from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import decode_access_token
from src.db.session import get_db_session
from src.models.enums import UserRole
from src.models.user import User

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
bearer_scheme = HTTPBearer(auto_error=False)
CredentialsDep = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def _auth_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(session: SessionDep, credentials: CredentialsDep) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _auth_error()
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except KeyError, TypeError, ValueError:
        raise _auth_error() from None

    user = await session.get(User, user_id)
    if user is None:
        raise _auth_error()
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен",
        )
    return current_user


async def get_current_admin_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав",
        )
    return current_user


CurrentUserDep = Annotated[User, Depends(get_current_active_user)]
CurrentAdminDep = Annotated[User, Depends(get_current_admin_user)]
