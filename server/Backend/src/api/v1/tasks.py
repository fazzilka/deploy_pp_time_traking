from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import CurrentUserDep
from src.db.session import get_db_session
from src.models.enums import TaskPriority
from src.models.task import Task
from src.schemas.task import TaskCreate, TaskRead, TaskUpdate
from src.services.timer import start_timer, stop_timer

router = APIRouter(prefix="/tasks", tags=["tasks"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def _task_detail_stmt(task_id: int, user_id: int) -> Select[tuple[Task]]:
    return (
        select(Task)
        .where(Task.id == task_id, Task.user_id == user_id)
        .options(selectinload(Task.intervals))
    )


async def _load_task_or_404(session: AsyncSession, task_id: int, user_id: int) -> Task:
    result = await session.execute(_task_detail_stmt(task_id, user_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    session: SessionDep,
    current_user: CurrentUserDep,
    search: Annotated[str | None, Query()] = None,
    has_time: Annotated[bool | None, Query()] = None,
    priority: Annotated[TaskPriority | None, Query()] = None,
    deadline_before: Annotated[date | None, Query()] = None,
    deadline_after: Annotated[date | None, Query()] = None,
) -> list[Task]:
    stmt = (
        select(Task)
        .where(Task.user_id == current_user.id)
        .options(selectinload(Task.intervals))
        .order_by(Task.id.desc())
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
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


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
    task = Task(
        title=payload.title,
        description=payload.description or "",
        deadline=payload.deadline,
        priority=payload.priority,
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
    task = await _load_task_or_404(session, task_id, current_user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "description" and value is None:
            value = ""
        setattr(task, key, value)
    await session.commit()
    return await _load_task_or_404(session, task_id, current_user.id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, session: SessionDep, current_user: CurrentUserDep) -> Response:
    task = await _load_task_or_404(session, task_id, current_user.id)
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
