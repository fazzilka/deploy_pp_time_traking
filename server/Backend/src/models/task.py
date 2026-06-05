from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base
from src.models.enums import TaskPriority

if TYPE_CHECKING:
    from src.models.time_interval import TimeInterval
    from src.models.user import User


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_id_created_at", "user_id", "created_at"),
        Index("ix_tasks_user_id_deadline", "user_id", "deadline"),
        Index("ix_tasks_user_id_priority", "user_id", "priority"),
        Index("ix_tasks_user_id_total_time_seconds", "user_id", "total_time_seconds"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    total_time_seconds: Mapped[int] = mapped_column(BigInteger(), nullable=False, default=0)
    deadline: Mapped[date | None] = mapped_column(Date(), nullable=True, index=True)
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

    user: Mapped[User] = relationship(back_populates="tasks")

    intervals: Mapped[list[TimeInterval]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TimeInterval.started_at.desc()",
    )
