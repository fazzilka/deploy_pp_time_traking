from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import CurrentUserDep
from src.db.session import get_db_session
from src.schemas.summary import SummaryResponse, SummaryTask
from src.services.summary import build_summary

router = APIRouter(tags=["summary"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    session: SessionDep,
    current_user: CurrentUserDep,
    limit: int = Query(default=10, ge=1, le=100),
) -> SummaryResponse:
    summary = await build_summary(session, current_user.id, limit=limit)
    return SummaryResponse(
        total_time_seconds_all_tasks=summary.total_time_seconds_all_tasks,
        tasks_with_time_count=summary.tasks_with_time_count,
        top_tasks=[SummaryTask.model_validate(task) for task in summary.top_tasks],
    )
