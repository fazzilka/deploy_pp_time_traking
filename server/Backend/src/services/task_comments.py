from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from typing import Final

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.enums import WorkspaceRole
from src.models.task import Task
from src.models.task_comment import TaskComment
from src.models.workspace import WorkspaceMember
from src.schemas.task_comment import (
    MAX_COMMENT_BODY_LENGTH,
    TaskCommentAuthor,
    TaskCommentRead,
)
from src.services.user_events import publish_workspace_event
from src.services.workspace import MUTATION_ROLES, get_active_membership

COMMENT_CREATE_LIMIT: Final[int] = 10
COMMENT_CREATE_WINDOW: Final[timedelta] = timedelta(minutes=1)
MANAGE_COMMENT_ROLES: Final[set[WorkspaceRole]] = {WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD}


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


def _validate_body(body: str) -> str:
    if not body.strip():
        raise HTTPException(
            status_code=422,
            detail="Комментарий не может быть пустым",
        )
    if len(body) > MAX_COMMENT_BODY_LENGTH:
        raise HTTPException(
            status_code=422,
            detail="Комментарий не может быть длиннее 5000 символов",
        )
    return body


def _encode_cursor(created_at: datetime, comment_id: int) -> str:
    raw = f"{created_at.isoformat()}|{comment_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str | None) -> tuple[datetime, int] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        created_at_raw, comment_id_raw = raw.rsplit("|", 1)
        created_at = datetime.fromisoformat(created_at_raw)
        return created_at, int(comment_id_raw)
    except ValueError, UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный cursor",
        ) from None


async def _load_task_and_membership(
    session: AsyncSession, user_id: int, task_id: int
) -> tuple[Task, WorkspaceMember]:
    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise _not_found()
    membership = await get_active_membership(session, user_id, task.workspace_id)
    if membership is None:
        raise _not_found()
    return task, membership


async def _load_comment_or_404(
    session: AsyncSession,
    task_id: int,
    comment_id: int,
    workspace_id: int,
) -> TaskComment:
    result = await session.execute(
        select(TaskComment)
        .where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task_id,
            TaskComment.workspace_id == workspace_id,
        )
        .options(selectinload(TaskComment.author))
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise _not_found()
    return comment


def _can_edit(comment: TaskComment, user_id: int) -> bool:
    return comment.deleted_at is None and comment.author_id == user_id


def _can_delete(comment: TaskComment, user_id: int, role: WorkspaceRole) -> bool:
    return comment.deleted_at is None and (
        comment.author_id == user_id or role in MANAGE_COMMENT_ROLES
    )


def _to_read(comment: TaskComment, user_id: int, role: WorkspaceRole) -> TaskCommentRead:
    is_deleted = comment.deleted_at is not None
    author = comment.author
    return TaskCommentRead(
        id=comment.id,
        task_id=comment.task_id,
        workspace_id=comment.workspace_id,
        author=TaskCommentAuthor(
            id=author.id,
            username=author.username,
            full_name=author.full_name,
            avatar_url=None,
        ),
        body=None if is_deleted else comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        deleted_at=comment.deleted_at,
        is_deleted=is_deleted,
        can_edit=_can_edit(comment, user_id),
        can_delete=_can_delete(comment, user_id, role),
    )


async def _assert_create_rate_limit(session: AsyncSession, user_id: int) -> None:
    since = datetime.now(UTC) - COMMENT_CREATE_WINDOW
    result = await session.execute(
        select(func.count(TaskComment.id)).where(
            TaskComment.author_id == user_id,
            TaskComment.created_at >= since,
        )
    )
    count = int(result.scalar_one() or 0)
    if count >= COMMENT_CREATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много комментариев, попробуйте позже",
        )


def _comment_page_stmt(task_id: int, cursor: str | None, limit: int) -> Select[tuple[TaskComment]]:
    stmt = (
        select(TaskComment)
        .where(TaskComment.task_id == task_id)
        .options(selectinload(TaskComment.author))
        .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
        .limit(limit + 1)
    )
    decoded = _decode_cursor(cursor)
    if decoded is None:
        return stmt
    created_at, comment_id = decoded
    return stmt.where(
        or_(
            TaskComment.created_at > created_at,
            and_(TaskComment.created_at == created_at, TaskComment.id > comment_id),
        )
    )


async def list_task_comments(
    session: AsyncSession,
    user_id: int,
    task_id: int,
    *,
    limit: int,
    cursor: str | None,
) -> tuple[list[TaskCommentRead], int, str | None]:
    task, membership = await _load_task_and_membership(session, user_id, task_id)
    result = await session.execute(_comment_page_stmt(task.id, cursor, limit))
    comments = list(result.scalars().all())
    page_comments = comments[:limit]
    next_cursor = None
    if len(comments) > limit and page_comments:
        last = page_comments[-1]
        next_cursor = _encode_cursor(last.created_at, last.id)
    total_result = await session.execute(
        select(func.count(TaskComment.id)).where(
            TaskComment.task_id == task.id,
            TaskComment.workspace_id == task.workspace_id,
            TaskComment.deleted_at.is_(None),
        )
    )
    total_active = int(total_result.scalar_one() or 0)
    return (
        [_to_read(comment, user_id, membership.role) for comment in page_comments],
        total_active,
        next_cursor,
    )


async def create_task_comment(
    session: AsyncSession,
    user_id: int,
    task_id: int,
    body: str,
) -> TaskCommentRead:
    task, membership = await _load_task_and_membership(session, user_id, task_id)
    if membership.role not in MUTATION_ROLES:
        raise _forbidden()
    await _assert_create_rate_limit(session, user_id)
    comment = TaskComment(
        task_id=task.id,
        workspace_id=task.workspace_id,
        author_id=user_id,
        body=_validate_body(body),
    )
    session.add(comment)
    await session.commit()
    result = await session.execute(
        select(TaskComment)
        .where(TaskComment.id == comment.id)
        .options(selectinload(TaskComment.author))
    )
    loaded = result.scalar_one()
    await publish_workspace_event(
        session,
        task.workspace_id,
        "task_comment_created",
        {"task_id": task.id, "comment_id": loaded.id},
    )
    return _to_read(loaded, user_id, membership.role)


async def update_task_comment(
    session: AsyncSession,
    user_id: int,
    task_id: int,
    comment_id: int,
    body: str,
) -> TaskCommentRead:
    task, membership = await _load_task_and_membership(session, user_id, task_id)
    comment = await _load_comment_or_404(session, task.id, comment_id, task.workspace_id)
    if comment.workspace_id != task.workspace_id:
        raise _not_found()
    if comment.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Комментарий удалён")
    if comment.author_id != user_id:
        raise _forbidden()
    comment.body = _validate_body(body)
    comment.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(comment)
    await publish_workspace_event(
        session,
        task.workspace_id,
        "task_comment_updated",
        {"task_id": task.id, "comment_id": comment.id},
    )
    return _to_read(comment, user_id, membership.role)


async def delete_task_comment(
    session: AsyncSession,
    user_id: int,
    task_id: int,
    comment_id: int,
) -> TaskCommentRead:
    task, membership = await _load_task_and_membership(session, user_id, task_id)
    comment = await _load_comment_or_404(session, task.id, comment_id, task.workspace_id)
    if comment.workspace_id != task.workspace_id:
        raise _not_found()
    if comment.deleted_at is None:
        if not _can_delete(comment, user_id, membership.role):
            raise _forbidden()
        comment.deleted_at = datetime.now(UTC)
        comment.deleted_by_id = user_id
        await session.commit()
        await session.refresh(comment)
        await publish_workspace_event(
            session,
            task.workspace_id,
            "task_comment_deleted",
            {"task_id": task.id, "comment_id": comment.id},
        )
    return _to_read(comment, user_id, membership.role)
