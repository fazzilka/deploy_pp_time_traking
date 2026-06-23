from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base

if TYPE_CHECKING:
    from src.models.task import Task
    from src.models.user import User
    from src.models.workspace import Workspace


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("char_length(name) > 0", name="ck_projects_name_not_blank"),
        UniqueConstraint("owner_id", "name", name="uq_projects_owner_id_name"),
        Index("ix_projects_owner_id_created_at", "owner_id", "created_at"),
        Index("ix_projects_owner_id_is_archived", "owner_id", "is_archived"),
        Index("ix_projects_workspace_id", "workspace_id"),
        Index("ix_projects_workspace_id_is_archived", "workspace_id", "is_archived"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    color: Mapped[str] = mapped_column(
        String(16), nullable=False, default="#2ea043", server_default="#2ea043"
    )
    icon: Mapped[str] = mapped_column(
        String(64), nullable=False, default="folder", server_default="folder"
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False, server_default="false", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(back_populates="projects")
    workspace: Mapped[Workspace] = relationship(back_populates="projects")
    tasks: Mapped[list[Task]] = relationship(back_populates="project")
