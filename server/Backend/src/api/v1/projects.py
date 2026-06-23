from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import CurrentUserDep
from src.api.v1.tasks import fetch_tasks
from src.core.deadlines import normalize_deadline_query
from src.db.session import get_db_session
from src.models.enums import TaskPriority
from src.models.project import Project
from src.models.task import Task
from src.schemas.project import (
    ProjectCreate,
    ProjectListItem,
    ProjectRead,
    ProjectSummary,
    ProjectUpdate,
)
from src.schemas.task import TaskRead
from src.services.project import (
    archive_project,
    build_project_summary,
    create_project,
    get_project_or_404,
    list_projects,
    update_project,
)
from src.services.user_events import publish_workspace_event

router = APIRouter(prefix="/projects", tags=["projects"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


async def _publish_project_event(
    session: AsyncSession,
    project: Project,
    event: str,
    *,
    changed_fields: set[str] | None = None,
) -> None:
    workspace_id = getattr(project, "workspace_id", None)
    if workspace_id is None:
        return

    await publish_workspace_event(
        session,
        workspace_id,
        event,
        {
            "project_id": project.id,
            "changed_fields": sorted(changed_fields or set()),
        },
    )


@router.get("", response_model=list[ProjectListItem])
async def get_projects(
    session: SessionDep,
    current_user: CurrentUserDep,
    workspace_id: Annotated[int | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
    search: Annotated[str | None, Query()] = None,
) -> list[ProjectListItem]:
    if workspace_id is None:
        return await list_projects(
            session,
            current_user.id,
            include_archived=include_archived,
            search=search,
        )
    return await list_projects(
        session,
        current_user.id,
        workspace_id=workspace_id,
        include_archived=include_archived,
        search=search,
    )


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def post_project(
    payload: ProjectCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Project:
    project = await create_project(session, current_user.id, payload)
    await _publish_project_event(session, project, "project_created")
    return project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Project:
    return await get_project_or_404(session, current_user.id, project_id)


@router.patch("/{project_id}", response_model=ProjectRead)
async def patch_project(
    project_id: int,
    payload: ProjectUpdate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Project:
    changed_fields = set(payload.model_dump(exclude_unset=True))
    project = await update_project(session, current_user.id, project_id, payload)
    await _publish_project_event(
        session,
        project,
        "project_updated",
        changed_fields=changed_fields,
    )
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Response:
    project = await get_project_or_404(session, current_user.id, project_id)
    workspace_id = project.workspace_id
    await archive_project(session, current_user.id, project_id)
    await publish_workspace_event(
        session,
        workspace_id,
        "project_deleted",
        {"project_id": project_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/summary", response_model=ProjectSummary)
async def get_project_summary(
    project_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 5,
) -> ProjectSummary:
    return await build_project_summary(session, current_user.id, project_id, limit=limit)


@router.get("/{project_id}/tasks", response_model=list[TaskRead])
async def get_project_tasks(
    project_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
    search: Annotated[str | None, Query()] = None,
    has_time: Annotated[bool | None, Query()] = None,
    priority: Annotated[TaskPriority | None, Query()] = None,
    deadline_before: Annotated[str | None, Query()] = None,
    deadline_after: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Task]:
    return await fetch_tasks(
        session,
        current_user.id,
        workspace_id=None,
        search=search,
        has_time=has_time,
        priority=priority,
        deadline_before=normalize_deadline_query(deadline_before, boundary="end"),
        deadline_after=normalize_deadline_query(deadline_after, boundary="start"),
        project_id=project_id,
        limit=limit,
        offset=offset,
    )
