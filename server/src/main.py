from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1 import api_v1_router
from src.db.session import AsyncSessionFactory

app = FastAPI(title="Учет времени выполнения задач", version="1.0.0")
app.include_router(api_v1_router)


@app.get("/health")
async def health() -> dict[str, str]:
    async with AsyncSessionFactory() as session:
        await _check_db(session)
    return {"status": "ok", "database": "ok"}


async def _check_db(session: AsyncSession) -> None:
    await session.execute(text("SELECT 1"))
