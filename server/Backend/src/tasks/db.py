from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.core.config import settings

CelerySessionFactory = async_sessionmaker[AsyncSession]


async def run_celery_db_task[T](
    handler: Callable[[CelerySessionFactory], Awaitable[T]],
) -> T:
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    try:
        return await handler(session_factory)
    finally:
        await engine.dispose()


def run_async_celery_task[T](coroutine_factory: Callable[[], Coroutine[Any, Any, T]]) -> T:
    return asyncio.run(coroutine_factory())
