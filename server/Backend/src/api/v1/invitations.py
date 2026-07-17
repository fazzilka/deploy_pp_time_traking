from uuid import UUID

from fastapi import APIRouter, Request

from src.api.deps import CurrentUserDep, SessionDep
from src.core.config import settings
from src.schemas.invitation import (
    InvitationResolveRequest,
    InvitationResolveResponse,
    WorkspaceInvitationRead,
)
from src.services.invitation import (
    accept_invitation,
    decline_invitation,
    list_user_invitations,
    resolve_invitation,
)
from src.services.rate_limit import enforce_rate_limit, get_request_client_ip

router = APIRouter(prefix="/invitations", tags=["invitations"])


@router.get("", response_model=list[WorkspaceInvitationRead])
async def get_my_invitations(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> list[WorkspaceInvitationRead]:
    invitations = await list_user_invitations(session, current_user)
    return [WorkspaceInvitationRead.model_validate(item) for item in invitations]


@router.post("/resolve", response_model=InvitationResolveResponse)
async def get_invitation_by_token(
    payload: InvitationResolveRequest,
    request: Request,
    session: SessionDep,
) -> InvitationResolveResponse:
    client_ip = get_request_client_ip(request)
    await enforce_rate_limit(
        session,
        scope="invitation_resolve",
        identifiers=(client_ip,),
        limit=settings.invitation_resolve_rate_limit_per_hour,
        window_seconds=3600,
    )
    return await resolve_invitation(session, payload.token)


@router.post("/{invitation_id}/accept", response_model=WorkspaceInvitationRead)
async def post_accept_invitation(
    invitation_id: UUID,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceInvitationRead:
    invitation = await accept_invitation(session, current_user, invitation_id)
    return WorkspaceInvitationRead.model_validate(invitation)


@router.post("/{invitation_id}/decline", response_model=WorkspaceInvitationRead)
async def post_decline_invitation(
    invitation_id: UUID,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> WorkspaceInvitationRead:
    invitation = await decline_invitation(session, current_user, invitation_id)
    return WorkspaceInvitationRead.model_validate(invitation)
