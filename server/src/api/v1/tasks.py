from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db.session import get_db_session
from src.models.task import Task
from src.schemas.task import TaskCreate, TaskRead, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def _task_detail_stmt(task_id: int) -> Select[tuple[Task]]:
    return select(Task).where(Task.id == task_id).options(selectinload(Task.intervals))


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
    result = await session.execute(_task_detail_stmt(task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, session: SessionDep) -> Task:
    task = Task(title=payload.title, description=payload.description)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    result = await session.execute(_task_detail_stmt(task.id))
    return result.scalar_one()


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(task_id: int, payload: TaskUpdate, session: SessionDep) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(task, key, value)
    await session.commit()
    result = await session.execute(_task_detail_stmt(task_id))
    return result.scalar_one()


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, session: SessionDep) -> Response:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    await session.delete(task)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
