from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base

if TYPE_CHECKING:
    from src.models.task import Task
    from src.models.user import User
    from src.models.workspace import Workspace


class TaskComment(Base):
    __tablename__ = "task_comments"
    __table_args__ = (
        CheckConstraint(
            "(deleted_at IS NULL AND deleted_by_id IS NULL) "
            "OR (deleted_at IS NOT NULL AND deleted_by_id IS NOT NULL)",
            name="ck_task_comments_deleted_consistency",
        ),
        Index("ix_task_comments_task_id_created_at", "task_id", "created_at"),
        Index("ix_task_comments_workspace_id_created_at", "workspace_id", "created_at"),
        Index("ix_task_comments_author_id_created_at", "author_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    task: Mapped[Task] = relationship(back_populates="comments")
    workspace: Mapped[Workspace] = relationship(back_populates="task_comments")
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    deleted_by: Mapped[User | None] = relationship(foreign_keys=[deleted_by_id])
