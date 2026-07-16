"""Add Resend email delivery lifecycle and opt-in preferences."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_resend_email"
down_revision: str | None = "0016_task_comments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("locale", sa.String(length=2), server_default="ru", nullable=False)
    )
    op.add_column(
        "users",
        sa.Column(
            "email_notifications_enabled", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column("email_deadline_24h", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("email_deadline_1h", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_deadline_overdue", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
    )
    op.add_column(
        "users", sa.Column("email_suppressed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_check_constraint("ck_users_locale_allowed", "users", "locale IN ('ru', 'en')")

    op.add_column("notification_deliveries", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column(
        "notification_deliveries",
        sa.Column("recipient_email", sa.String(length=320), nullable=True),
    )
    op.add_column(
        "notification_deliveries", sa.Column("provider", sa.String(length=32), nullable=True)
    )
    op.add_column(
        "notification_deliveries",
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "notification_deliveries",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "notification_deliveries", sa.Column("last_error_code", sa.String(length=64), nullable=True)
    )
    for column_name in (
        "queued_at",
        "sending_at",
        "delivered_at",
        "bounced_at",
        "complained_at",
        "failed_at",
    ):
        op.add_column(
            "notification_deliveries",
            sa.Column(column_name, sa.DateTime(timezone=True), nullable=True),
        )

    op.execute(
        "UPDATE notification_deliveries AS delivery "
        "SET user_id = notification.user_id "
        "FROM notifications AS notification "
        "WHERE notification.id = delivery.notification_id"
    )
    op.alter_column("notification_deliveries", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_notification_deliveries_user_id_users",
        "notification_deliveries",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_notification_deliveries_user_id", "notification_deliveries", ["user_id"], unique=False
    )
    op.create_index(
        "ix_notification_deliveries_provider_message_id",
        "notification_deliveries",
        ["provider_message_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_user_created",
        "notification_deliveries",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_notification_deliveries_idempotency_key",
        "notification_deliveries",
        ["idempotency_key"],
    )
    op.drop_constraint(
        "ck_notification_deliveries_status_allowed", "notification_deliveries", type_="check"
    )
    op.create_check_constraint(
        "ck_notification_deliveries_status_allowed",
        "notification_deliveries",
        "status IN ('pending', 'queued', 'sending', 'sent', 'delivered', "
        "'bounced', 'complained', 'failed', 'suppressed', 'skipped')",
    )

    op.create_table(
        "notification_webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("provider", "provider_event_id", name="uq_notification_webhook_event"),
    )
    op.create_index(
        "ix_notification_webhook_events_received_at",
        "notification_webhook_events",
        ["received_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_webhook_events_received_at", table_name="notification_webhook_events"
    )
    op.drop_table("notification_webhook_events")
    op.drop_constraint(
        "ck_notification_deliveries_status_allowed", "notification_deliveries", type_="check"
    )
    op.execute(
        "UPDATE notification_deliveries SET status = CASE "
        "WHEN status IN ('delivered') THEN 'sent' "
        "WHEN status IN ('bounced', 'complained', 'suppressed') THEN 'failed' "
        "WHEN status IN ('queued', 'sending') THEN 'pending' "
        "ELSE status END"
    )
    op.create_check_constraint(
        "ck_notification_deliveries_status_allowed",
        "notification_deliveries",
        "status IN ('pending', 'sent', 'failed', 'skipped')",
    )
    op.drop_constraint(
        "uq_notification_deliveries_idempotency_key",
        "notification_deliveries",
        type_="unique",
    )
    op.drop_index("ix_notification_deliveries_user_created", table_name="notification_deliveries")
    op.drop_index(
        "ix_notification_deliveries_provider_message_id", table_name="notification_deliveries"
    )
    op.drop_index("ix_notification_deliveries_user_id", table_name="notification_deliveries")
    op.drop_constraint(
        "fk_notification_deliveries_user_id_users",
        "notification_deliveries",
        type_="foreignkey",
    )
    for column_name in (
        "failed_at",
        "complained_at",
        "bounced_at",
        "delivered_at",
        "sending_at",
        "queued_at",
        "last_error_code",
        "idempotency_key",
        "provider_message_id",
        "provider",
        "recipient_email",
        "user_id",
    ):
        op.drop_column("notification_deliveries", column_name)

    op.drop_constraint("ck_users_locale_allowed", "users", type_="check")
    for column_name in (
        "email_suppressed_at",
        "email_deadline_overdue",
        "email_deadline_1h",
        "email_deadline_24h",
        "email_notifications_enabled",
        "locale",
    ):
        op.drop_column("users", column_name)
