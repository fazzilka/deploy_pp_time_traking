from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base
from src.models.enums import WorkspaceMemberStatus, WorkspaceRole, WorkspaceType

if TYPE_CHECKING:
    from src.models.notification import Notification
    from src.models.project import Project
    from src.models.task import Task
    from src.models.user import User


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint("type IN ('personal', 'team')", name="ck_workspaces_type_allowed"),
        Index("ix_workspaces_owner_id", "owner_id"),
        Index("ix_workspaces_owner_id_type", "owner_id", "type"),
        Index("ix_workspaces_owner_id_is_protected", "owner_id", "is_protected"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    type: Mapped[WorkspaceType] = mapped_column(
        Enum(
            WorkspaceType,
            name="workspace_type",
            native_enum=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        default=WorkspaceType.PERSONAL,
        server_default=WorkspaceType.PERSONAL.value,
        index=True,
    )
    is_protected: Mapped[bool] = mapped_column(
        Boolean(),
        nullable=False,
        default=False,
        server_default=false(),
        index=True,
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(back_populates="owned_workspaces")
    members: Mapped[list[WorkspaceMember]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    projects: Mapped[list[Project]] = relationship(back_populates="workspace")
    tasks: Mapped[list[Task]] = relationship(back_populates="workspace")
    notifications: Mapped[list[Notification]] = relationship(back_populates="workspace")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'team_lead', 'member', 'viewer')",
            name="ck_workspace_members_role_allowed",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_workspace_members_status_allowed",
        ),
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
        Index("ix_workspace_members_workspace_id", "workspace_id"),
        Index("ix_workspace_members_user_id", "user_id"),
        Index("ix_workspace_members_workspace_id_status", "workspace_id", "status"),
        Index(
            "ix_workspace_members_workspace_id_role_status",
            "workspace_id",
            "role",
            "status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        Enum(
            WorkspaceRole,
            name="workspace_role",
            native_enum=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        default=WorkspaceRole.MEMBER,
        server_default=WorkspaceRole.MEMBER.value,
        index=True,
    )
    status: Mapped[WorkspaceMemberStatus] = mapped_column(
        Enum(
            WorkspaceMemberStatus,
            name="workspace_member_status",
            native_enum=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        default=WorkspaceMemberStatus.ACTIVE,
        server_default=WorkspaceMemberStatus.ACTIVE.value,
        index=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    workspace: Mapped[Workspace] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="workspace_memberships")
