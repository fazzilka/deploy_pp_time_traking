from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db.session import get_db_session
from src.models.task import Task
from src.schemas.task import TaskCreate, TaskRead, TaskUpdate
from src.services.timer import start_timer, stop_timer

router = APIRouter(prefix="/tasks", tags=["tasks"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def _task_detail_stmt(task_id: int) -> Select[tuple[Task]]:
    return select(Task).where(Task.id == task_id).options(selectinload(Task.intervals))


async def _load_task_or_404(session: AsyncSession, task_id: int) -> Task:
    result = await session.execute(_task_detail_stmt(task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    session: SessionDep,
    search: str | None = Query(default=None),
    has_time: bool | None = Query(default=None),
) -> list[Task]:
    stmt = select(Task).options(selectinload(Task.intervals)).order_by(Task.id.desc())
    if search:
        stmt = stmt.where(Task.title.ilike(f"%{search}%"))
    if has_time is True:
        stmt = stmt.where(Task.total_time_seconds > 0)
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: int, session: SessionDep) -> Task:
    return await _load_task_or_404(session, task_id)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, session: SessionDep) -> Task:
    task = Task(title=payload.title, description=payload.description)
    session.add(task)
    await session.commit()
    return await _load_task_or_404(session, task.id)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(task_id: int, payload: TaskUpdate, session: SessionDep) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    await session.commit()
    return await _load_task_or_404(session, task_id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, session: SessionDep) -> Response:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    await session.delete(task)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{task_id}/timer/start", response_model=TaskRead)
async def start_task_timer(task_id: int, session: SessionDep) -> Task:
    await start_timer(session, task_id)
    return await _load_task_or_404(session, task_id)


@router.post("/{task_id}/timer/stop", response_model=TaskRead)
async def stop_task_timer(task_id: int, session: SessionDep) -> Task:
    await stop_timer(session, task_id)
    return await _load_task_or_404(session, task_id)
