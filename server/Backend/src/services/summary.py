from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.task import Task


async def build_summary(
    session: AsyncSession, user_id: int, limit: int = 10
) -> tuple[int, list[Task]]:
    total_stmt = select(func.coalesce(func.sum(Task.total_time_seconds), 0)).where(
        Task.user_id == user_id
    )
    total_result = await session.execute(total_stmt)
    total_time = int(total_result.scalar_one())

    top_stmt = (
        select(Task)
        .where(Task.user_id == user_id, Task.total_time_seconds > 0)
        .order_by(Task.total_time_seconds.desc(), Task.id.asc())
        .limit(limit)
    )
    top_result = await session.execute(top_stmt)
    top_tasks = list(top_result.scalars().unique().all())
    return total_time, top_tasks
