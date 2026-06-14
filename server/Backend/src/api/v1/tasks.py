from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import CurrentUserDep
from src.db.session import get_db_session
from src.models.enums import TaskPriority, WorkspaceRole
from src.models.task import Task
from src.models.time_interval import TimeInterval
from src.schemas.task import TaskCreate, TaskRead, TaskUpdate
from src.services.project import get_active_project_or_404, get_project_or_404
from src.services.timer import start_timer, stop_timer
from src.services.workspace import (
    get_accessible_workspace_id,
    get_active_membership,
    require_workspace_mutation,
    require_workspace_role,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def _task_detail_stmt(task_id: int, user_id: int) -> Select[tuple[Task]]:
    _ = user_id
    return (
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.intervals), selectinload(Task.project))
    )


async def _load_task_or_404(session: AsyncSession, task_id: int, user_id: int) -> Task:
    result = await session.execute(_task_detail_stmt(task_id, user_id))
    task = result.scalar_one_or_none()
    if task is None or not await _can_access_task(session, task, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


async def _load_owned_task_or_404(session: AsyncSession, task_id: int, user_id: int) -> Task:
    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None or not await _can_access_task(session, task, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


async def _can_access_task(session: AsyncSession, task: Task, user_id: int) -> bool:
    workspace_id = getattr(task, "workspace_id", None)
    if workspace_id is None:
        return getattr(task, "user_id", user_id) == user_id
    return await get_active_membership(session, user_id, workspace_id) is not None


async def _has_active_interval(session: AsyncSession, task_id: int) -> bool:
    result = await session.execute(
        select(TimeInterval.id)
        .where(TimeInterval.task_id == task_id, TimeInterval.finished_at.is_(None))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _require_task_update_permission(session: AsyncSession, user_id: int, task: Task) -> None:
    workspace_id = getattr(task, "workspace_id", None)
    if workspace_id is None:
        return

    membership = await get_active_membership(session, user_id, workspace_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    if membership.role in {WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD}:
        return
    if membership.role == WorkspaceRole.MEMBER and (
        getattr(task, "created_by_id", None) == user_id
        or getattr(task, "assignee_id", None) == user_id
        or getattr(task, "user_id", None) == user_id
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


async def _require_task_delete_permission(session: AsyncSession, user_id: int, task: Task) -> None:
    workspace_id = getattr(task, "workspace_id", None)
    if workspace_id is None:
        return

    await require_workspace_role(
        session,
        user_id,
        workspace_id,
        {WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD},
    )


async def fetch_tasks(
    session: AsyncSession,
    user_id: int,
    *,
    search: str | None = None,
    has_time: bool | None = None,
    priority: TaskPriority | None = None,
    deadline_before: date | None = None,
    deadline_after: date | None = None,
    workspace_id: int | None = None,
    project_id: int | None = None,
    without_project: bool = False,
    is_completed: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Task]:
    if project_id is not None and without_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id и without_project нельзя использовать вместе",
        )
    resolved_workspace_id = await get_accessible_workspace_id(session, user_id, workspace_id)
    if project_id is not None:
        project = await get_project_or_404(session, user_id, project_id)
        if workspace_id is None:
            resolved_workspace_id = project.workspace_id
        elif project.workspace_id != resolved_workspace_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Проект принадлежит другому workspace",
            )

    stmt = (
        select(Task)
        .where(Task.workspace_id == resolved_workspace_id)
        .options(
            selectinload(Task.intervals.and_(TimeInterval.finished_at.is_(None))),
            selectinload(Task.project),
        )
        .order_by(Task.created_at.desc(), Task.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if search:
        stmt = stmt.where(Task.title.ilike(f"%{search}%"))
    if has_time is True:
        stmt = stmt.where(Task.total_time_seconds > 0)
    if priority is not None:
        stmt = stmt.where(Task.priority == priority)
    if deadline_before is not None:
        stmt = stmt.where(Task.deadline <= deadline_before)
    if deadline_after is not None:
        stmt = stmt.where(Task.deadline >= deadline_after)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if without_project:
        stmt = stmt.where(Task.project_id.is_(None))
    if is_completed is not None:
        stmt = stmt.where(Task.is_completed.is_(is_completed))

    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    session: SessionDep,
    current_user: CurrentUserDep,
    search: Annotated[str | None, Query()] = None,
    has_time: Annotated[bool | None, Query()] = None,
    priority: Annotated[TaskPriority | None, Query()] = None,
    deadline_before: Annotated[date | None, Query()] = None,
    deadline_after: Annotated[date | None, Query()] = None,
    workspace_id: Annotated[int | None, Query()] = None,
    project_id: Annotated[int | None, Query()] = None,
    without_project: Annotated[bool, Query()] = False,
    is_completed: Annotated[bool | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Task]:
    return await fetch_tasks(
        session,
        current_user.id,
        search=search,
        has_time=has_time,
        priority=priority,
        deadline_before=deadline_before,
        deadline_after=deadline_after,
        workspace_id=workspace_id,
        project_id=project_id,
        without_project=without_project,
        is_completed=is_completed,
        limit=limit,
        offset=offset,
    )


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: int, session: SessionDep, current_user: CurrentUserDep) -> Task:
    return await _load_task_or_404(session, task_id, current_user.id)


@router.post(
    "",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    payload: TaskCreate, session: SessionDep, current_user: CurrentUserDep
) -> Task:
    workspace_id = await get_accessible_workspace_id(session, current_user.id, payload.workspace_id)
    if payload.project_id is not None:
        project = await get_active_project_or_404(session, current_user.id, payload.project_id)
        if payload.workspace_id is None:
            workspace_id = project.workspace_id
        elif project.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Проект принадлежит другому workspace",
            )

    await require_workspace_mutation(session, current_user.id, workspace_id)
    assignee_id = payload.assignee_id or current_user.id
    if not await get_active_membership(session, assignee_id, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Исполнитель не состоит в workspace",
        )

    task = Task(
        title=payload.title,
        description=payload.description or "",
        deadline=payload.deadline,
        priority=payload.priority,
        workspace_id=workspace_id,
        project_id=payload.project_id,
        created_by_id=current_user.id,
        assignee_id=assignee_id,
        user_id=current_user.id,
    )
    session.add(task)
    await session.commit()
    return await _load_task_or_404(session, task.id, current_user.id)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Task:
    task = await _load_owned_task_or_404(session, task_id, current_user.id)
    task_workspace_id = getattr(task, "workspace_id", None)
    await _require_task_update_permission(session, current_user.id, task)
    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("is_completed") is True and await _has_active_interval(session, task_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сначала остановите таймер",
        )

    for key, value in update_data.items():
        if key == "description" and value is None:
            value = ""
        if key == "project_id" and value is not None:
            project = await get_active_project_or_404(session, current_user.id, value)
            if task_workspace_id is not None and project.workspace_id != task_workspace_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Проект принадлежит другому workspace",
                )
        if key == "assignee_id" and value is not None:
            if task_workspace_id is not None and not await get_active_membership(
                session, value, task_workspace_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Исполнитель не состоит в workspace",
                )
        setattr(task, key, value)
    await session.commit()
    return await _load_task_or_404(session, task_id, current_user.id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, session: SessionDep, current_user: CurrentUserDep) -> Response:
    task = await _load_owned_task_or_404(session, task_id, current_user.id)
    await _require_task_delete_permission(session, current_user.id, task)
    await session.delete(task)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{task_id}/timer/start", response_model=TaskRead)
async def start_task_timer(task_id: int, session: SessionDep, current_user: CurrentUserDep) -> Task:
    await start_timer(session, task_id, current_user.id)
    return await _load_task_or_404(session, task_id, current_user.id)


@router.post("/{task_id}/timer/stop", response_model=TaskRead)
async def stop_task_timer(task_id: int, session: SessionDep, current_user: CurrentUserDep) -> Task:
    await stop_timer(session, task_id, current_user.id)
    return await _load_task_or_404(session, task_id, current_user.id)
