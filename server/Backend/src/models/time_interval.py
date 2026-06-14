from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base


class TimeInterval(Base):
    __tablename__ = "time_intervals"
    __table_args__ = (
        Index("ix_time_intervals_task_id", "task_id"),
        Index("ix_time_intervals_user_id", "user_id"),
        Index("ix_time_intervals_started_at", "started_at"),
        Index("ix_time_intervals_finished_at", "finished_at"),
        Index("ix_time_intervals_task_id_finished_at", "task_id", "finished_at"),
        Index("ix_time_intervals_task_id_started_at", "task_id", "started_at"),
        Index("ix_time_intervals_started_at_finished_at", "started_at", "finished_at"),
        Index(
            "ux_time_intervals_one_active_per_task",
            "task_id",
            unique=True,
            postgresql_where=text("finished_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task = relationship("Task", back_populates="intervals")
    user = relationship("User")
