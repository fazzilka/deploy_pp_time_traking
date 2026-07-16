from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1 import api_v1_router
from src.api.webhooks import router as webhooks_router
from src.core.config import settings
from src.core.logging import configure_logging
from src.db.session import AsyncSessionFactory
from src.middleware.request_id import RequestIdMiddleware

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)
HTTP_LATENCY_BUCKETS = (
    0.01,
    0.025,
    0.05,
    0.075,
    0.1,
    0.15,
    0.2,
    0.25,
    0.3,
    0.4,
    0.5,
    0.6,
    0.75,
    1,
    1.5,
    2.5,
    5,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("Приложение запущено")
    yield


app = FastAPI(title="Учет времени выполнения задач", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(api_v1_router)
app.include_router(webhooks_router)
Instrumentator().instrument(app, latency_lowr_buckets=HTTP_LATENCY_BUCKETS).expose(
    app,
    include_in_schema=False,
)


@app.get("/health")
async def health() -> dict[str, str]:
    async with AsyncSessionFactory() as session:
        await _check_db(session)
        await _check_schema(session)
    return {"status": "ok", "database": "ok", "schema": "ok"}


async def _check_db(session: AsyncSession) -> None:
    await session.execute(text("SELECT 1"))


async def _check_schema(session: AsyncSession) -> None:
    result = await session.execute(
        text(
            "SELECT "
            "to_regclass('public.tasks') IS NOT NULL, "
            "to_regclass('public.time_intervals') IS NOT NULL, "
            "to_regclass('public.users') IS NOT NULL"
        )
    )
    tasks_exists, intervals_exist, users_exist = result.one()
    if not tasks_exists or not intervals_exist or not users_exist:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database schema is not ready",
        )
