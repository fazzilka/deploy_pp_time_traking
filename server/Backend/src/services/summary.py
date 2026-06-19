from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.enums import TaskPriority
from src.models.task import Task
from src.schemas.project import ProjectTimeSummaryItem
from src.services.project import build_projects_time_summary
from src.services.workspace import get_accessible_workspace_id


@dataclass(frozen=True)
class SummaryTaskData:
    id: int
    title: str
    description: str | None
    total_time_seconds: int
    deadline: datetime | None
    priority: TaskPriority


@dataclass(frozen=True)
class SummaryData:
    total_time_seconds_all_tasks: int
    tasks_with_time_count: int
    top_tasks: list[SummaryTaskData]


@dataclass(frozen=True)
class ProjectsSummaryData:
    items: list[ProjectTimeSummaryItem]
    total_time_seconds: int


async def build_summary(
    session: AsyncSession,
    user_id: int,
    workspace_id: int | None = None,
    limit: int = 10,
) -> SummaryData:
    resolved_workspace_id = await get_accessible_workspace_id(session, user_id, workspace_id)
    tasks_with_time = func.coalesce(
        func.sum(case((Task.total_time_seconds > 0, 1), else_=0)),
        0,
    )
    stats_stmt = select(
        func.coalesce(func.sum(Task.total_time_seconds), 0),
        tasks_with_time,
    ).where(Task.workspace_id == resolved_workspace_id)
    stats_result = await session.execute(stats_stmt)
    total_time, tasks_with_time_count = stats_result.one()

    top_stmt = (
        select(
            Task.id,
            Task.title,
            Task.description,
            Task.total_time_seconds,
            Task.deadline,
            Task.priority,
        )
        .where(Task.workspace_id == resolved_workspace_id, Task.total_time_seconds > 0)
        .order_by(Task.total_time_seconds.desc(), Task.id.asc())
        .limit(limit)
    )
    top_result = await session.execute(top_stmt)
    top_tasks = [
        SummaryTaskData(
            id=task_id,
            title=title,
            description=description,
            total_time_seconds=total_time_seconds,
            deadline=deadline,
            priority=priority,
        )
        for task_id, title, description, total_time_seconds, deadline, priority in top_result.all()
    ]
    return SummaryData(
        total_time_seconds_all_tasks=int(total_time),
        tasks_with_time_count=int(tasks_with_time_count),
        top_tasks=top_tasks,
    )


async def build_projects_summary(
    session: AsyncSession,
    user_id: int,
    workspace_id: int | None = None,
) -> ProjectsSummaryData:
    items = await build_projects_time_summary(session, user_id, workspace_id=workspace_id)
    return ProjectsSummaryData(
        items=items,
        total_time_seconds=sum(item.total_time_seconds for item in items),
    )
