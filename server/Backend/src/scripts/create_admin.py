from __future__ import annotations

import asyncio
import os

from sqlalchemy import select

from src.core.security import get_password_hash
from src.db.session import AsyncSessionFactory
from src.models.enums import UserRole
from src.models.user import User


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"Environment variable {name} is required")
    return value


async def create_admin() -> None:
    email = _required_env("ADMIN_EMAIL").lower()
    username = _required_env("ADMIN_USERNAME")
    password = _required_env("ADMIN_PASSWORD")
    full_name = os.getenv("ADMIN_FULL_NAME")
    if len(password) < 6:
        raise RuntimeError("ADMIN_PASSWORD must contain at least 6 characters")

    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(User).where((User.email == email) | (User.username == username))
        )
        existing_user = result.scalar_one_or_none()
        if existing_user is not None:
            print("Admin user already exists")
            return

        session.add(
            User(
                email=email,
                username=username,
                full_name=full_name,
                hashed_password=get_password_hash(password),
                role=UserRole.ADMIN,
                is_active=True,
            )
        )
        await session.commit()
        print("Admin user created")


def main() -> None:
    asyncio.run(create_admin())


if __name__ == "__main__":
    main()
