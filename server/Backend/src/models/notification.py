from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.session import Base
from src.models.enums import (
    NotificationDeliveryChannel,
    NotificationDeliveryStatus,
    NotificationType,
)

if TYPE_CHECKING:
    from src.models.task import Task
    from src.models.user import User
    from src.models.workspace import Workspace


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id", "user_id"),
        Index("ix_notifications_is_read", "is_read"),
        Index("ix_notifications_created_at", "created_at"),
        Index("ix_notifications_user_id_is_read_created_at", "user_id", "is_read", "created_at"),
        Index(
            "uq_notifications_dedupe_key_not_null",
            "dedupe_key",
            unique=True,
            postgresql_where=text("dedupe_key IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[int | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(
            NotificationType,
            name="notification_type",
            native_enum=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text(), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB(), nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_read: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False, server_default="false", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="notifications")
    workspace: Mapped[Workspace | None] = relationship(back_populates="notifications")
    task: Mapped[Task | None] = relationship(back_populates="notifications")
    deliveries: Mapped[list[NotificationDelivery]] = relationship(
        back_populates="notification",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "notification_id",
            "channel",
            name="uq_notification_deliveries_notification_channel",
        ),
        Index("ix_notification_deliveries_notification_id", "notification_id"),
        Index("ix_notification_deliveries_channel", "channel"),
        Index("ix_notification_deliveries_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[NotificationDeliveryChannel] = mapped_column(
        Enum(
            NotificationDeliveryChannel,
            name="notification_delivery_channel",
            native_enum=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    status: Mapped[NotificationDeliveryStatus] = mapped_column(
        Enum(
            NotificationDeliveryStatus,
            name="notification_delivery_status",
            native_enum=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        default=NotificationDeliveryStatus.PENDING,
        server_default=NotificationDeliveryStatus.PENDING.value,
    )
    attempts: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text(), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    notification: Mapped[Notification] = relationship(back_populates="deliveries")
