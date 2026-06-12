from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.task import Task
from src.models.time_interval import TimeInterval


def utc_now() -> datetime:
    return datetime.now(UTC)


async def start_timer(session: AsyncSession, task_id: int, user_id: int) -> Task:
    task = await _get_task_for_update(session, task_id, user_id)
    if task.is_completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя запустить таймер для завершённой задачи",
        )

    active_interval = await _get_active_interval(session, task_id)
    if active_interval is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Активный интервал уже существует",
        )
    session.add(TimeInterval(task_id=task_id, started_at=utc_now(), finished_at=None))
    await session.commit()
    await session.refresh(task)
    return task


async def stop_timer(session: AsyncSession, task_id: int, user_id: int) -> Task:
    task = await _get_task_for_update(session, task_id, user_id)
    active_interval = await _get_active_interval(session, task_id)
    if active_interval is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Активный интервал не найден",
        )
    finished_at = utc_now()
    active_interval.finished_at = finished_at
    duration = int((finished_at - active_interval.started_at).total_seconds())
    if duration < 0:
        duration = 0
    task.total_time_seconds += duration
    await session.commit()
    await session.refresh(task)
    return task


async def _get_task_for_update(session: AsyncSession, task_id: int, user_id: int) -> Task:
    stmt = select(Task).where(Task.id == task_id, Task.user_id == user_id).with_for_update()
    result = await session.execute(stmt)
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


async def _get_active_interval(session: AsyncSession, task_id: int) -> TimeInterval | None:
    stmt = (
        select(TimeInterval)
        .where(TimeInterval.task_id == task_id, TimeInterval.finished_at.is_(None))
        .order_by(TimeInterval.started_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
