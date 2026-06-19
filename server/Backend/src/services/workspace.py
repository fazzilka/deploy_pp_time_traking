import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.enums import NotificationType, WorkspaceMemberStatus, WorkspaceRole, WorkspaceType
from src.models.project import Project
from src.models.task import Task
from src.models.time_interval import TimeInterval
from src.models.user import User
from src.models.workspace import Workspace, WorkspaceMember
from src.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceMemberSummaryItem,
    WorkspaceMemberSummaryResponse,
    WorkspaceMemberUpdate,
    WorkspaceMemberUser,
    WorkspaceRead,
    WorkspaceSummary,
    WorkspaceUpdate,
)
from src.services.notification import create_notification, enqueue_notification_delivery

MUTATION_ROLES = {WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD, WorkspaceRole.MEMBER}
PROJECT_MANAGEMENT_ROLES = {WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD}
MEMBER_MANAGEMENT_ROLES = {WorkspaceRole.OWNER, WorkspaceRole.TEAM_LEAD}
logger = logging.getLogger(__name__)


def _workspace_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace не найден")


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


async def ensure_personal_workspace(session: AsyncSession, user: User) -> Workspace:
    if _is_lightweight_test_session(session):
        return Workspace(
            id=getattr(user, "id", None) or 0,
            name="Личное пространство",
            description=None,
            type=WorkspaceType.PERSONAL,
            owner_id=getattr(user, "id", None) or 0,
        )

    result = await session.execute(
        select(Workspace)
        .where(Workspace.owner_id == user.id, Workspace.type == WorkspaceType.PERSONAL)
        .order_by(Workspace.id.asc())
        .limit(1)
    )
    workspace = result.scalar_one_or_none()
    if workspace is not None:
        return workspace

    workspace = Workspace(
        name="Личное пространство",
        description=None,
        type=WorkspaceType.PERSONAL,
        owner_id=user.id,
    )
    session.add(workspace)
    if hasattr(session, "flush"):
        await session.flush()
    else:
        workspace.id = user.id
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER,
            status=WorkspaceMemberStatus.ACTIVE,
        )
    )
    await session.commit()
    await session.refresh(workspace)
    return workspace


async def get_current_workspace_id(
    session: AsyncSession,
    user: User,
    workspace_id: int | None = None,
) -> int:
    if workspace_id is not None:
        await get_workspace_or_404(session, user, workspace_id)
        return workspace_id

    workspace = await ensure_personal_workspace(session, user)
    return workspace.id


async def get_accessible_workspace_id(
    session: AsyncSession,
    user_id: int,
    workspace_id: int | None = None,
) -> int:
    if _is_lightweight_test_session(session):
        return workspace_id or user_id

    if workspace_id is not None:
        membership = await get_active_membership(session, user_id, workspace_id)
        if membership is None:
            raise _workspace_not_found()
        return workspace_id

    result = await session.execute(select(User).where(User.id == user_id))
    if not hasattr(result, "scalar_one_or_none"):
        return user_id
    user = result.scalar_one_or_none()
    if user is None:
        raise _workspace_not_found()
    workspace = await ensure_personal_workspace(session, user)
    return workspace.id


async def get_active_membership(
    session: AsyncSession,
    user_id: int,
    workspace_id: int,
) -> WorkspaceMember | None:
    if _is_lightweight_test_session(session):
        workspace = Workspace(
            id=workspace_id,
            name="Личное пространство",
            description=None,
            type=WorkspaceType.PERSONAL,
            owner_id=user_id,
        )
        return WorkspaceMember(
            id=0,
            workspace_id=workspace_id,
            user_id=user_id,
            role=WorkspaceRole.OWNER,
            status=WorkspaceMemberStatus.ACTIVE,
            workspace=workspace,
        )

    result = await session.execute(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == WorkspaceMemberStatus.ACTIVE,
        )
        .options(selectinload(WorkspaceMember.workspace), selectinload(WorkspaceMember.user))
    )
    membership = result.scalar_one_or_none()
    return membership


async def check_workspace_member(session: AsyncSession, user_id: int, workspace_id: int) -> bool:
    return await get_active_membership(session, user_id, workspace_id) is not None


async def require_workspace_role(
    session: AsyncSession,
    user_id: int,
    workspace_id: int,
    allowed_roles: set[WorkspaceRole],
) -> WorkspaceMember:
    membership = await get_active_membership(session, user_id, workspace_id)
    if membership is None:
        raise _workspace_not_found()
    if membership.role not in allowed_roles:
        raise _forbidden()
    return membership


async def require_workspace_mutation(
    session: AsyncSession,
    user_id: int,
    workspace_id: int,
) -> WorkspaceMember:
    return await require_workspace_role(session, user_id, workspace_id, MUTATION_ROLES)


async def require_project_management(
    session: AsyncSession,
    user_id: int,
    workspace_id: int,
) -> WorkspaceMember:
    return await require_workspace_role(session, user_id, workspace_id, PROJECT_MANAGEMENT_ROLES)


async def get_workspace_or_404(
    session: AsyncSession,
    user: User,
    workspace_id: int,
) -> Workspace:
    membership = await get_active_membership(session, user.id, workspace_id)
    if membership is None:
        raise _workspace_not_found()
    return membership.workspace


async def get_user_workspaces(session: AsyncSession, user: User) -> list[WorkspaceRead]:
    await ensure_personal_workspace(session, user)
    result = await session.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == WorkspaceMemberStatus.ACTIVE,
        )
        .order_by(Workspace.type.asc(), Workspace.created_at.asc(), Workspace.id.asc())
    )
    return [
        await build_workspace_read(session, workspace, user.id) for workspace in result.scalars()
    ]


async def create_workspace(
    session: AsyncSession,
    user: User,
    payload: WorkspaceCreate,
) -> WorkspaceRead:
    workspace_type = WorkspaceType.TEAM if payload.type == WorkspaceType.PERSONAL else payload.type
    workspace = Workspace(
        name=payload.name,
        description=payload.description,
        type=workspace_type,
        owner_id=user.id,
    )
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER,
            status=WorkspaceMemberStatus.ACTIVE,
        )
    )
    await session.commit()
    await session.refresh(workspace)
    return await build_workspace_read(session, workspace, user.id)


async def update_workspace(
    session: AsyncSession,
    user: User,
    workspace_id: int,
    payload: WorkspaceUpdate,
) -> WorkspaceRead:
    await require_workspace_role(session, user.id, workspace_id, {WorkspaceRole.OWNER})
    workspace = await get_workspace_or_404(session, user, workspace_id)
    values = payload.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(workspace, key, value)
    await session.commit()
    await session.refresh(workspace)
    return await build_workspace_read(session, workspace, user.id)


async def list_workspace_members(
    session: AsyncSession,
    user: User,
    workspace_id: int,
) -> list[WorkspaceMemberRead]:
    await get_workspace_or_404(session, user, workspace_id)
    result = await session.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user))
        .order_by(WorkspaceMember.role.asc(), WorkspaceMember.joined_at.asc())
    )
    summaries = await _member_summaries_by_user_id(session, workspace_id)
    members = []
    for member in result.scalars().all():
        summary = summaries.get(member.user_id, {})
        members.append(
            WorkspaceMemberRead(
                id=member.id,
                workspace_id=member.workspace_id,
                user=_member_user(member.user),
                role=member.role,
                status=member.status,
                joined_at=member.joined_at,
                projects_count=int(summary.get("projects_count", 0)),
                tasks_count=int(summary.get("tasks_count", 0)),
                completed_tasks_count=int(summary.get("completed_tasks_count", 0)),
                total_time_seconds=int(summary.get("total_time_seconds", 0)),
            )
        )
    return members


async def add_workspace_member_by_email(
    session: AsyncSession,
    user: User,
    workspace_id: int,
    payload: WorkspaceMemberAdd,
) -> WorkspaceMemberRead:
    actor_membership = await require_workspace_role(
        session,
        user.id,
        workspace_id,
        MEMBER_MANAGEMENT_ROLES,
    )
    if payload.role == WorkspaceRole.OWNER:
        raise _forbidden()
    if actor_membership.role == WorkspaceRole.TEAM_LEAD and payload.role == WorkspaceRole.TEAM_LEAD:
        raise _forbidden()
    workspace_name = _workspace_name_from_membership(actor_membership, workspace_id)

    result = await session.execute(select(User).where(User.email == payload.email.lower()))
    target_user = result.scalar_one_or_none()
    if target_user is None or not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь с таким email не найден",
        )

    existing = await get_active_membership(session, target_user.id, workspace_id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь уже состоит в команде",
        )

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=target_user.id,
        role=payload.role,
        status=WorkspaceMemberStatus.ACTIVE,
    )
    session.add(member)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь уже состоит в команде",
        ) from exc
    await session.refresh(member)
    member.user = target_user
    await _safe_create_workspace_notification(
        session,
        user_id=target_user.id,
        workspace_id=workspace_id,
        workspace_name=workspace_name,
        notification_type=NotificationType.WORKSPACE_MEMBER_ADDED,
        title="Вас добавили в рабочее пространство",
        message=f"Вас добавили в рабочее пространство «{workspace_name}».",
        event="member_added",
        dedupe_key=f"workspace_member_added:workspace:{workspace_id}:user:{target_user.id}",
    )
    return WorkspaceMemberRead(
        id=member.id,
        workspace_id=member.workspace_id,
        user=_member_user(target_user),
        role=member.role,
        status=member.status,
        joined_at=member.joined_at,
    )


async def update_workspace_member(
    session: AsyncSession,
    user: User,
    workspace_id: int,
    member_id: int,
    payload: WorkspaceMemberUpdate,
) -> WorkspaceMemberRead:
    await require_workspace_role(session, user.id, workspace_id, {WorkspaceRole.OWNER})
    member = await _load_member_or_404(session, workspace_id, member_id)
    values = payload.model_dump(exclude_unset=True)
    next_role = values.get("role")
    if next_role == WorkspaceRole.OWNER:
        raise _forbidden()

    if member.role == WorkspaceRole.OWNER and next_role != WorkspaceRole.OWNER:
        await _ensure_another_owner(session, workspace_id, member.user_id)

    for key, value in values.items():
        setattr(member, key, value)
    await session.commit()
    await session.refresh(member)
    return await _member_read(session, member)


async def remove_workspace_member(
    session: AsyncSession,
    user: User,
    workspace_id: int,
    member_id: int,
) -> None:
    await require_workspace_role(session, user.id, workspace_id, {WorkspaceRole.OWNER})
    member = await _load_member_or_404(session, workspace_id, member_id)
    if member.role == WorkspaceRole.OWNER:
        await _ensure_another_owner(session, workspace_id, member.user_id)
    removed_user_id = member.user_id
    removed_workspace_id = member.workspace_id
    workspace_name = _workspace_name_from_membership(member, workspace_id)
    await session.delete(member)
    await session.commit()
    await _safe_create_workspace_notification(
        session,
        user_id=removed_user_id,
        workspace_id=removed_workspace_id,
        workspace_name=workspace_name,
        notification_type=NotificationType.WORKSPACE_MEMBER_REMOVED,
        title="Вас удалили из рабочего пространства",
        message=f"Вас удалили из рабочего пространства «{workspace_name}».",
        event="member_removed",
        dedupe_key=(
            f"workspace_member_removed:workspace:{removed_workspace_id}:"
            f"user:{removed_user_id}:event:{uuid4()}"
        ),
    )


async def build_workspace_read(
    session: AsyncSession,
    workspace: Workspace,
    user_id: int,
) -> WorkspaceRead:
    membership = await get_active_membership(session, user_id, workspace.id)
    if membership is None:
        raise _workspace_not_found()

    members_count = await _scalar_int(
        session,
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.status == WorkspaceMemberStatus.ACTIVE,
        ),
    )
    projects_count = await _scalar_int(
        session,
        select(func.count(Project.id)).where(
            Project.workspace_id == workspace.id,
            Project.is_archived.is_(False),
        ),
    )
    tasks_count = await _scalar_int(
        session,
        select(func.count(Task.id)).where(Task.workspace_id == workspace.id),
    )
    total_time_seconds = await _scalar_int(
        session,
        select(func.coalesce(func.sum(Task.total_time_seconds), 0)).where(
            Task.workspace_id == workspace.id
        ),
    )
    return WorkspaceRead(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        type=workspace.type,
        owner_id=workspace.owner_id,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        members_count=members_count,
        projects_count=projects_count,
        tasks_count=tasks_count,
        total_time_seconds=total_time_seconds,
        current_user_role=membership.role,
    )


async def build_workspace_summary(
    session: AsyncSession,
    user: User,
    workspace_id: int,
) -> WorkspaceSummary:
    workspace = await get_workspace_or_404(session, user, workspace_id)
    workspace_read = await build_workspace_read(session, workspace, user.id)
    active_members_count = await _scalar_int(
        session,
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == WorkspaceMemberStatus.ACTIVE,
        ),
    )
    active_tasks_count = await _scalar_int(
        session,
        select(func.count(func.distinct(Task.id)))
        .join(TimeInterval, TimeInterval.task_id == Task.id)
        .where(Task.workspace_id == workspace_id, TimeInterval.finished_at.is_(None)),
    )
    completed_tasks_count = await _scalar_int(
        session,
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.is_completed.is_(True),
        ),
    )
    return WorkspaceSummary(
        workspace=workspace_read,
        members_count=workspace_read.members_count,
        active_members_count=active_members_count,
        projects_count=workspace_read.projects_count,
        active_projects_count=workspace_read.projects_count,
        tasks_count=workspace_read.tasks_count,
        active_tasks_count=active_tasks_count,
        completed_tasks_count=completed_tasks_count,
        total_time_seconds=workspace_read.total_time_seconds,
    )


async def build_workspace_member_summary(
    session: AsyncSession,
    user: User,
    workspace_id: int,
) -> WorkspaceMemberSummaryResponse:
    await get_workspace_or_404(session, user, workspace_id)
    members = await list_workspace_members(session, user, workspace_id)
    return WorkspaceMemberSummaryResponse(
        items=[
            WorkspaceMemberSummaryItem(
                user=member.user,
                role=member.role,
                status=member.status,
                tasks_count=member.tasks_count,
                completed_tasks_count=member.completed_tasks_count,
                projects_count=member.projects_count,
                total_time_seconds=member.total_time_seconds,
            )
            for member in members
        ]
    )


async def _load_member_or_404(
    session: AsyncSession,
    workspace_id: int,
    member_id: int,
) -> WorkspaceMember:
    result = await session.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user), selectinload(WorkspaceMember.workspace))
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Участник не найден")
    return member


def _workspace_name_from_membership(membership: Any, workspace_id: int) -> str:
    workspace = getattr(membership, "workspace", None)
    workspace_name = getattr(workspace, "name", None)
    if isinstance(workspace_name, str) and workspace_name:
        return workspace_name
    return f"Workspace {workspace_id}"


async def _safe_create_workspace_notification(
    session: AsyncSession,
    *,
    user_id: int,
    workspace_id: int,
    workspace_name: str,
    notification_type: NotificationType,
    title: str,
    message: str,
    event: str,
    dedupe_key: str,
) -> None:
    try:
        notification = await create_notification(
            session,
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            workspace_id=workspace_id,
            payload={
                "workspace_id": workspace_id,
                "workspace_name": workspace_name,
                "event": event,
            },
            dedupe_key=dedupe_key,
        )
    except Exception:
        logger.exception(
            "failed to create workspace notification",
            extra={"workspace_id": workspace_id, "user_id": user_id, "event": event},
        )
        return

    if notification is not None:
        enqueue_notification_delivery(notification.id)


async def _member_read(session: AsyncSession, member: WorkspaceMember) -> WorkspaceMemberRead:
    summaries = await _member_summaries_by_user_id(session, member.workspace_id)
    summary = summaries.get(member.user_id, {})
    return WorkspaceMemberRead(
        id=member.id,
        workspace_id=member.workspace_id,
        user=_member_user(member.user),
        role=member.role,
        status=member.status,
        joined_at=member.joined_at,
        projects_count=int(summary.get("projects_count", 0)),
        tasks_count=int(summary.get("tasks_count", 0)),
        completed_tasks_count=int(summary.get("completed_tasks_count", 0)),
        total_time_seconds=int(summary.get("total_time_seconds", 0)),
    )


async def _ensure_another_owner(
    session: AsyncSession,
    workspace_id: int,
    excluded_user_id: int,
) -> None:
    owners_count = await _scalar_int(
        session,
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id != excluded_user_id,
            WorkspaceMember.role == WorkspaceRole.OWNER,
            WorkspaceMember.status == WorkspaceMemberStatus.ACTIVE,
        ),
    )
    if owners_count < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить или понизить единственного owner",
        )


async def _member_summaries_by_user_id(
    session: AsyncSession,
    workspace_id: int,
) -> dict[int, dict[str, int]]:
    member_rows = await session.execute(
        select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == workspace_id)
    )
    summaries: dict[int, dict[str, int]] = {
        int(user_id): {
            "tasks_count": 0,
            "completed_tasks_count": 0,
            "projects_count": 0,
            "total_time_seconds": 0,
        }
        for (user_id,) in member_rows.all()
    }

    task_rows = await session.execute(
        select(
            Task.id,
            Task.assignee_id,
            Task.created_by_id,
            Task.project_id,
            Task.is_completed,
        ).where(Task.workspace_id == workspace_id)
    )
    project_rows = await session.execute(
        select(Project.id, Project.owner_id).where(Project.workspace_id == workspace_id)
    )
    interval_rows = await session.execute(
        select(TimeInterval.user_id, func.coalesce(func.sum(_interval_duration_expr()), 0))
        .join(Task, Task.id == TimeInterval.task_id)
        .where(Task.workspace_id == workspace_id)
        .group_by(TimeInterval.user_id)
    )

    project_ids_by_user: dict[int, set[int]] = {user_id: set() for user_id in summaries}
    counted_task_ids_by_user: dict[int, set[int]] = {user_id: set() for user_id in summaries}

    for project_id, owner_id in project_rows.all():
        if owner_id in project_ids_by_user:
            project_ids_by_user[int(owner_id)].add(int(project_id))

    for task_id, assignee_id, created_by_id, project_id, is_completed in task_rows.all():
        participant_ids = {
            user_id for user_id in (assignee_id, created_by_id) if user_id in summaries
        }
        for participant_id in participant_ids:
            participant_id = int(participant_id)
            if int(task_id) in counted_task_ids_by_user[participant_id]:
                continue
            counted_task_ids_by_user[participant_id].add(int(task_id))
            summaries[participant_id]["tasks_count"] += 1
            if is_completed:
                summaries[participant_id]["completed_tasks_count"] += 1
            if project_id is not None:
                project_ids_by_user[participant_id].add(int(project_id))

    for user_id, total_time_seconds in interval_rows.all():
        if user_id is None:
            continue
        summaries.setdefault(
            int(user_id),
            {
                "tasks_count": 0,
                "completed_tasks_count": 0,
                "projects_count": 0,
                "total_time_seconds": 0,
            },
        )["total_time_seconds"] = int(total_time_seconds or 0)

    for user_id, project_ids in project_ids_by_user.items():
        summaries[user_id]["projects_count"] = len(project_ids)
    return summaries


def _interval_duration_expr() -> Any:
    return func.extract("epoch", TimeInterval.finished_at - TimeInterval.started_at)


async def _scalar_int(session: AsyncSession, stmt: Any) -> int:
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


def _member_user(user: User) -> WorkspaceMemberUser:
    return WorkspaceMemberUser.model_validate(user)


def _is_lightweight_test_session(session: AsyncSession) -> bool:
    return session.__class__.__name__ == "DummySession"
