from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_db_session
from src.schemas.summary import SummaryResponse
from src.schemas.task import TaskRead
from src.services.summary import build_summary

router = APIRouter(tags=["summary"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    session: SessionDep,
    limit: int = Query(default=10, ge=1, le=100),
) -> SummaryResponse:
    total_time, top_tasks = await build_summary(session, limit=limit)
    return SummaryResponse(
        total_time_seconds=total_time,
        top_tasks=[TaskRead.model_validate(task) for task in top_tasks],
    )
