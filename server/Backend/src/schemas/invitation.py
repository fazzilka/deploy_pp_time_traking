from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.models.enums import WorkspaceInvitationStatus, WorkspaceRole


class WorkspaceInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: WorkspaceRole = WorkspaceRole.MEMBER


class WorkspaceInvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: int
    invited_email: EmailStr
    invited_user_id: int | None
    invited_by_user_id: int
    role: WorkspaceRole
    status: WorkspaceInvitationStatus
    expires_at: datetime
    accepted_at: datetime | None
    declined_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class InvitationResolveResponse(BaseModel):
    id: UUID
    workspace_id: int
    workspace_name: str
    invited_email_masked: str
    invited_by_display_name: str
    role: WorkspaceRole
    status: WorkspaceInvitationStatus
    expires_at: datetime


class InvitationResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=32, max_length=256)
