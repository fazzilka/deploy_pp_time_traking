from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.enums import WorkspaceRole
from src.models.task import Task
from src.services.workspace import get_active_membership


async def require_task_update_permission(
    session: AsyncSession,
    user_id: int,
    task: Task,
) -> None:
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
