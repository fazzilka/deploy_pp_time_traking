from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from src.models.enums import TaskPriority
from src.models.project import Project
from src.models.task import Task
from src.models.time_interval import TimeInterval
from src.schemas.project import (
    ProjectCreate,
    ProjectListItem,
    ProjectSummary,
    ProjectSummaryTask,
    ProjectTimeSummaryItem,
    ProjectUpdate,
)

UNASSIGNED_PROJECT_COLOR = "#8b949e"
UNASSIGNED_PROJECT_NAME = "Без проекта"


def _duplicate_project_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Проект с таким названием уже существует",
    )


def _project_not_found_error() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")


def _active_tasks_count_expr() -> ColumnElement[int]:
    return func.count(func.distinct(case((TimeInterval.id.is_not(None), Task.id))))


def _tasks_with_time_count_expr() -> ColumnElement[int]:
    return func.coalesce(func.sum(case((Task.total_time_seconds > 0, 1), else_=0)), 0)


async def create_project(
    session: AsyncSession,
    user_id: int,
    payload: ProjectCreate,
) -> Project:
    project = Project(
        owner_id=user_id,
        name=payload.name,
        description=payload.description,
        color=payload.color,
    )
    session.add(project)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _duplicate_project_error() from exc
    await session.refresh(project)
    return project


async def get_project_or_404(session: AsyncSession, user_id: int, project_id: int) -> Project:
    result = await session.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise _project_not_found_error()
    return project


async def get_active_project_or_404(
    session: AsyncSession,
    user_id: int,
    project_id: int,
) -> Project:
    project = await get_project_or_404(session, user_id, project_id)
    if project.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя использовать архивный проект",
        )
    return project


async def list_projects(
    session: AsyncSession,
    user_id: int,
    *,
    include_archived: bool = False,
    search: str | None = None,
) -> list[ProjectListItem]:
    stmt = (
        select(
            Project.id,
            Project.name,
            Project.description,
            Project.color,
            Project.is_archived,
            Project.created_at,
            Project.updated_at,
            func.count(Task.id),
            _active_tasks_count_expr(),
            _tasks_with_time_count_expr(),
            func.coalesce(func.sum(Task.total_time_seconds), 0),
        )
        .outerjoin(Task, Task.project_id == Project.id)
        .outerjoin(
            TimeInterval,
            and_(TimeInterval.task_id == Task.id, TimeInterval.finished_at.is_(None)),
        )
        .where(Project.owner_id == user_id)
        .group_by(
            Project.id,
            Project.name,
            Project.description,
            Project.color,
            Project.is_archived,
            Project.created_at,
            Project.updated_at,
        )
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    if not include_archived:
        stmt = stmt.where(Project.is_archived.is_(False))
    if search:
        stmt = stmt.where(Project.name.ilike(f"%{search}%"))

    result = await session.execute(stmt)
    return [
        ProjectListItem(
            id=project_id,
            name=name,
            description=description,
            color=color,
            is_archived=is_archived,
            created_at=created_at,
            updated_at=updated_at,
            tasks_count=int(tasks_count or 0),
            active_tasks_count=int(active_tasks_count or 0),
            tasks_with_time_count=int(tasks_with_time_count or 0),
            total_time_seconds=int(total_time_seconds or 0),
        )
        for (
            project_id,
            name,
            description,
            color,
            is_archived,
            created_at,
            updated_at,
            tasks_count,
            active_tasks_count,
            tasks_with_time_count,
            total_time_seconds,
        ) in result.all()
    ]


async def update_project(
    session: AsyncSession,
    user_id: int,
    project_id: int,
    payload: ProjectUpdate,
) -> Project:
    project = await get_project_or_404(session, user_id, project_id)
    values = payload.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(project, key, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise _duplicate_project_error() from exc
    await session.refresh(project)
    return project


async def archive_project(session: AsyncSession, user_id: int, project_id: int) -> None:
    project = await get_project_or_404(session, user_id, project_id)
    project.is_archived = True
    await session.commit()


async def build_project_summary(
    session: AsyncSession,
    user_id: int,
    project_id: int,
    *,
    limit: int = 5,
) -> ProjectSummary:
    project = await get_project_or_404(session, user_id, project_id)
    stats_stmt = (
        select(
            func.count(Task.id),
            _active_tasks_count_expr(),
            _tasks_with_time_count_expr(),
            func.coalesce(func.sum(Task.total_time_seconds), 0),
        )
        .select_from(Task)
        .outerjoin(
            TimeInterval,
            and_(TimeInterval.task_id == Task.id, TimeInterval.finished_at.is_(None)),
        )
        .where(Task.user_id == user_id, Task.project_id == project_id)
    )
    stats_result = await session.execute(stats_stmt)
    tasks_count, active_tasks_count, tasks_with_time_count, total_time_seconds = (
        stats_result.one()
    )

    top_stmt = (
        select(
            Task.id,
            Task.title,
            Task.description,
            Task.total_time_seconds,
            Task.deadline,
            Task.priority,
        )
        .where(Task.user_id == user_id, Task.project_id == project_id, Task.total_time_seconds > 0)
        .order_by(Task.total_time_seconds.desc(), Task.id.asc())
        .limit(limit)
    )
    top_result = await session.execute(top_stmt)
    top_tasks = [
        ProjectSummaryTask(
            id=task_id,
            title=title,
            description=description,
            total_time_seconds=int(total_time_seconds),
            deadline=deadline,
            priority=priority or TaskPriority.MEDIUM,
        )
        for task_id, title, description, total_time_seconds, deadline, priority in top_result.all()
    ]

    return ProjectSummary(
        id=project.id,
        name=project.name,
        description=project.description,
        color=project.color,
        is_archived=project.is_archived,
        created_at=project.created_at,
        updated_at=project.updated_at,
        tasks_count=int(tasks_count or 0),
        active_tasks_count=int(active_tasks_count or 0),
        tasks_with_time_count=int(tasks_with_time_count or 0),
        total_time_seconds=int(total_time_seconds or 0),
        top_tasks=top_tasks,
    )


async def build_projects_time_summary(
    session: AsyncSession,
    user_id: int,
) -> list[ProjectTimeSummaryItem]:
    stmt = (
        select(
            Project.id,
            Project.name,
            Project.color,
            func.count(Task.id),
            _active_tasks_count_expr(),
            func.coalesce(func.sum(Task.total_time_seconds), 0),
        )
        .select_from(Task)
        .outerjoin(Project, Project.id == Task.project_id)
        .outerjoin(
            TimeInterval,
            and_(TimeInterval.task_id == Task.id, TimeInterval.finished_at.is_(None)),
        )
        .where(Task.user_id == user_id)
        .group_by(Project.id, Project.name, Project.color)
        .order_by(func.coalesce(func.sum(Task.total_time_seconds), 0).desc(), Project.name.asc())
    )
    result = await session.execute(stmt)
    raw_items = [
        (
            project_id,
            name or UNASSIGNED_PROJECT_NAME,
            color or UNASSIGNED_PROJECT_COLOR,
            int(tasks_count or 0),
            int(active_tasks_count or 0),
            int(total_time_seconds or 0),
        )
        for project_id, name, color, tasks_count, active_tasks_count, total_time_seconds in (
            result.all()
        )
    ]
    total_time = sum(item[5] for item in raw_items)
    return [
        ProjectTimeSummaryItem(
            project_id=project_id,
            name=name,
            color=color,
            tasks_count=tasks_count,
            active_tasks_count=active_tasks_count,
            total_time_seconds=total_time_seconds,
            percentage=round((total_time_seconds / total_time) * 100, 2) if total_time else 0.0,
        )
        for project_id, name, color, tasks_count, active_tasks_count, total_time_seconds in (
            raw_items
        )
    ]
