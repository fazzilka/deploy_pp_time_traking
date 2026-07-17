from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import CurrentUserDep
from src.core.config import settings
from src.db.session import get_db_session
from src.schemas.invitation import WorkspaceInvitationCreate, WorkspaceInvitationRead
from src.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberRead,
    WorkspaceMemberSummaryResponse,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceSummary,
    WorkspaceUpdate,
)
from src.services.invitation import (
    create_workspace_invitation,
    list_workspace_invitations,
    resend_invitation,
    revoke_invitation,
)
from src.services.rate_limit import enforce_rate_limit, get_request_client_ip
from src.services.workspace import (
    build_workspace_member_summary,
    build_workspace_read,
    build_workspace_summary,
    create_workspace,
    get_user_workspaces,
    get_workspace_or_404,
    leave_workspace,
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


@router.post("/{workspace_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def post_leave_workspace(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Response:
    await leave_workspace(session, current_user, workspace_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberRead])
async def get_workspace_members(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> list[WorkspaceMemberRead]:
    return await list_workspace_members(session, current_user, workspace_id)


@router.post("/{workspace_id}/members", status_code=status.HTTP_405_METHOD_NOT_ALLOWED)
async def post_workspace_member_deprecated(workspace_id: int) -> Response:
    _ = workspace_id
    return Response(status_code=status.HTTP_405_METHOD_NOT_ALLOWED)


@router.post(
    "/{workspace_id}/invitations",
    response_model=WorkspaceInvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_workspace_invitation(
    workspace_id: int,
    payload: WorkspaceInvitationCreate,
    request: Request,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceInvitationRead:
    client_ip = get_request_client_ip(request)
    await enforce_rate_limit(
        session,
        scope="invitation_create",
        identifiers=(client_ip, str(current_user.id), str(workspace_id)),
        limit=settings.invitation_create_rate_limit_per_hour,
        window_seconds=3600,
    )
    invitation = await create_workspace_invitation(session, current_user, workspace_id, payload)
    return WorkspaceInvitationRead.model_validate(invitation)


@router.get(
    "/{workspace_id}/invitations",
    response_model=list[WorkspaceInvitationRead],
)
async def get_workspace_invitations(
    workspace_id: int,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> list[WorkspaceInvitationRead]:
    invitations = await list_workspace_invitations(session, current_user, workspace_id)
    return [WorkspaceInvitationRead.model_validate(item) for item in invitations]


@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    response_model=WorkspaceInvitationRead,
)
async def delete_workspace_invitation(
    workspace_id: int,
    invitation_id: UUID,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceInvitationRead:
    invitation = await revoke_invitation(session, current_user, workspace_id, invitation_id)
    return WorkspaceInvitationRead.model_validate(invitation)


@router.post(
    "/{workspace_id}/invitations/{invitation_id}/resend",
    response_model=WorkspaceInvitationRead,
)
async def post_resend_workspace_invitation(
    workspace_id: int,
    invitation_id: UUID,
    request: Request,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceInvitationRead:
    client_ip = get_request_client_ip(request)
    await enforce_rate_limit(
        session,
        scope="invitation_resend",
        identifiers=(client_ip, str(current_user.id), str(invitation_id)),
        limit=settings.invitation_create_rate_limit_per_hour,
        window_seconds=3600,
    )
    invitation = await resend_invitation(session, current_user, workspace_id, invitation_id)
    return WorkspaceInvitationRead.model_validate(invitation)


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
