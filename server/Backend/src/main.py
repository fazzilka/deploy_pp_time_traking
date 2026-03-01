from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1 import api_v1_router
from src.core.config import settings
from src.core.logging import configure_logging
from src.db.session import AsyncSessionFactory
from src.middleware.request_id import RequestIdMiddleware

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("Приложение запущено")
    yield


app = FastAPI(title="Учет времени выполнения задач", version="1.0.0", lifespan=lifespan)
app.add_middleware(RequestIdMiddleware)
app.include_router(api_v1_router)
Instrumentator().instrument(app).expose(app, include_in_schema=False)


@app.get("/health")
async def health() -> dict[str, str]:
    async with AsyncSessionFactory() as session:
        await _check_db(session)
    return {"status": "ok", "database": "ok"}


async def _check_db(session: AsyncSession) -> None:
    await session.execute(text("SELECT 1"))
