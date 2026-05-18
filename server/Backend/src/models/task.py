from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base

if TYPE_CHECKING:
    from src.models.time_interval import TimeInterval
    from src.models.user import User


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    total_time_seconds: Mapped[int] = mapped_column(BigInteger(), nullable=False, default=0)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    user: Mapped[User] = relationship(back_populates="tasks")

    intervals: Mapped[list[TimeInterval]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TimeInterval.started_at.desc()",
    )
