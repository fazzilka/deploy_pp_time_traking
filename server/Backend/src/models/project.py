from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base

if TYPE_CHECKING:
    from src.models.task import Task
    from src.models.user import User


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("owner_id", "name", name="uq_projects_owner_id_name"),
        Index("ix_projects_owner_id_created_at", "owner_id", "created_at"),
        Index("ix_projects_owner_id_is_archived", "owner_id", "is_archived"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
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
    tasks: Mapped[list[Task]] = relationship(back_populates="project")
