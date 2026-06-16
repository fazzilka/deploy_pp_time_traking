from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import CurrentUserDep
from src.db.session import get_db_session
from src.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceMemberSummaryResponse,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceSummary,
    WorkspaceUpdate,
)
from src.services.workspace import (
    add_workspace_member_by_email,
    build_workspace_member_summary,
    build_workspace_read,
    build_workspace_summary,
    create_workspace,
    get_user_workspaces,
    get_workspace_or_404,
    list_workspace_members,
    remove_workspace_member,
    update_workspace,
    update_workspace_member,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(session: SessionDep, current_user: CurrentUserDep) -> list[WorkspaceRead]:
    return await get_user_workspaces(session, current_user)


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def post_workspace(
    payload: WorkspaceCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceRead:
    return await create_workspace(session, current_user, payload)


@router.get("/{workspace_id}", response_model=WorkspaceRead)
async def get_workspace(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceRead:
    workspace = await get_workspace_or_404(session, current_user, workspace_id)
    return await build_workspace_read(session, workspace, current_user.id)


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
async def patch_workspace(
    workspace_id: int,
    payload: WorkspaceUpdate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceRead:
    return await update_workspace(session, current_user, workspace_id, payload)


@router.delete("/{workspace_id}", status_code=status.HTTP_405_METHOD_NOT_ALLOWED)
async def delete_workspace(workspace_id: int) -> Response:
    _ = workspace_id
    return Response(status_code=status.HTTP_405_METHOD_NOT_ALLOWED)


@router.get("/{workspace_id}/summary", response_model=WorkspaceSummary)
async def get_workspace_summary(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceSummary:
    return await build_workspace_summary(session, current_user, workspace_id)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberRead])
async def get_workspace_members(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> list[WorkspaceMemberRead]:
    return await list_workspace_members(session, current_user, workspace_id)


@router.post(
    "/{workspace_id}/members",
    response_model=WorkspaceMemberRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_workspace_member(
    workspace_id: int,
    payload: WorkspaceMemberAdd,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceMemberRead:
    return await add_workspace_member_by_email(session, current_user, workspace_id, payload)


@router.get("/{workspace_id}/members/summary", response_model=WorkspaceMemberSummaryResponse)
async def get_workspace_members_summary(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceMemberSummaryResponse:
    return await build_workspace_member_summary(session, current_user, workspace_id)


@router.patch("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberRead)
async def patch_workspace_member(
    workspace_id: int,
    member_id: int,
    payload: WorkspaceMemberUpdate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceMemberRead:
    return await update_workspace_member(session, current_user, workspace_id, member_id, payload)


@router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace_member(
    workspace_id: int,
    member_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Response:
    await remove_workspace_member(session, current_user, workspace_id, member_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
