from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from src.models.enums import WorkspaceMemberStatus, WorkspaceRole, WorkspaceType


class WorkspaceBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Название workspace не может быть пустым")
        return value

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class WorkspaceCreate(WorkspaceBase):
    type: WorkspaceType = WorkspaceType.TEAM


class WorkspaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def trim_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Название workspace не может быть пустым")
        return value

    @field_validator("description")
    @classmethod
    def trim_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    type: WorkspaceType
    is_protected: bool = False
    owner_id: int
    created_at: datetime
    updated_at: datetime
    members_count: int = 0
    projects_count: int = 0
    tasks_count: int = 0
    total_time_seconds: int = 0
    current_user_role: WorkspaceRole


class WorkspaceMemberUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    username: str
    full_name: str | None = None
    avatar_letter: str = ""
    avatar_seed: str | None = None
    is_active: bool

    @model_validator(mode="after")
    def fill_avatar_letter(self) -> Self:
        if not self.avatar_letter:
            source = self.full_name.strip() if self.full_name else self.username
            self.avatar_letter = source[:1].upper()
        return self


class WorkspaceMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    user: WorkspaceMemberUser
    role: WorkspaceRole
    status: WorkspaceMemberStatus
    joined_at: datetime
    projects_count: int = 0
    tasks_count: int = 0
    completed_tasks_count: int = 0
    total_time_seconds: int = 0


class WorkspaceMemberAdd(BaseModel):
    email: EmailStr
    role: WorkspaceRole = WorkspaceRole.MEMBER


class WorkspaceMemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: WorkspaceRole | None = None
    status: WorkspaceMemberStatus | None = None


class WorkspaceSummary(BaseModel):
    workspace: WorkspaceRead
    members_count: int
    active_members_count: int
    projects_count: int
    active_projects_count: int
    tasks_count: int
    active_tasks_count: int
    completed_tasks_count: int
    total_time_seconds: int


class WorkspaceMemberSummaryItem(BaseModel):
    user: WorkspaceMemberUser
    role: WorkspaceRole
    status: WorkspaceMemberStatus
    tasks_count: int
    completed_tasks_count: int
    projects_count: int
    total_time_seconds: int


class WorkspaceMemberSummaryResponse(BaseModel):
    items: list[WorkspaceMemberSummaryItem]


class TeamActivityItem(BaseModel):
    id: int
    actor: WorkspaceMemberUser | None = None
    action: str
    target: str
    created_at: datetime
