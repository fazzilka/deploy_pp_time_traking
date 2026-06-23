from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base
from src.models.enums import TaskPriority

if TYPE_CHECKING:
    from src.models.notification import Notification
    from src.models.project import Project
    from src.models.time_interval import TimeInterval
    from src.models.user import User
    from src.models.workspace import Workspace


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("total_time_seconds >= 0", name="ck_tasks_total_time_non_negative"),
        CheckConstraint(
            "priority IN ('lowest', 'low', 'medium', 'high', 'highest')",
            name="ck_tasks_priority_allowed",
        ),
        Index("ix_tasks_user_id_created_at", "user_id", "created_at"),
        Index("ix_tasks_user_id_deadline", "user_id", "deadline"),
        Index("ix_tasks_user_id_priority", "user_id", "priority"),
        Index("ix_tasks_user_id_project_id", "user_id", "project_id"),
        Index("ix_tasks_user_id_is_completed", "user_id", "is_completed"),
        Index("ix_tasks_user_id_total_time_seconds", "user_id", "total_time_seconds"),
        Index("ix_tasks_workspace_id", "workspace_id"),
        Index("ix_tasks_workspace_id_project_id", "workspace_id", "project_id"),
        Index("ix_tasks_workspace_id_assignee_id", "workspace_id", "assignee_id"),
        Index("ix_tasks_workspace_id_is_completed", "workspace_id", "is_completed"),
        Index("ix_tasks_workspace_id_deadline", "workspace_id", "deadline"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    total_time_seconds: Mapped[int] = mapped_column(BigInteger(), nullable=False, default=0)
    deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(
            TaskPriority,
            name="task_priority",
            native_enum=False,
            values_callable=lambda priorities: [priority.value for priority in priorities],
        ),
        nullable=False,
        default=TaskPriority.MEDIUM,
        server_default=TaskPriority.MEDIUM.value,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_completed: Mapped[bool] = mapped_column(
        Boolean(),
        nullable=False,
        default=False,
        server_default=false(),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )

    user: Mapped[User] = relationship(back_populates="tasks", foreign_keys=[user_id])
    workspace: Mapped[Workspace] = relationship(back_populates="tasks")
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    project: Mapped[Project | None] = relationship(back_populates="tasks")

    intervals: Mapped[list[TimeInterval]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TimeInterval.started_at.desc()",
    )
    notifications: Mapped[list[Notification]] = relationship(back_populates="task")
