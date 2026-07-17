"""Add secure workspace invitations and pending email verification."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0018_invites_verify"
down_revision: str | None = "0017_resend_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.execute("UPDATE users SET email_verified = true")
    op.create_index("ix_users_email_verified", "users", ["email_verified"], unique=False)

    op.create_table(
        "pending_registrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("verification_code_hash", sa.String(length=64), nullable=False),
        sa.Column("locale", sa.String(length=2), server_default="ru", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("resend_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("generation", sa.Integer(), server_default="1", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resend_available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("attempts >= 0", name="ck_pending_registrations_attempts_non_negative"),
        sa.CheckConstraint(
            "resend_count >= 0", name="ck_pending_registrations_resends_non_negative"
        ),
        sa.CheckConstraint("generation >= 1", name="ck_pending_registrations_generation_positive"),
        sa.UniqueConstraint("email", name="uq_pending_registrations_email"),
    )
    op.create_index(
        "ix_pending_registrations_email", "pending_registrations", ["email"], unique=True
    )
    op.create_index(
        "ix_pending_registrations_username", "pending_registrations", ["username"], unique=False
    )
    op.create_index(
        "ix_pending_registrations_expires_at", "pending_registrations", ["expires_at"], unique=False
    )
    op.create_index(
        "ix_pending_registrations_consumed_at",
        "pending_registrations",
        ["consumed_at"],
        unique=False,
    )

    op.create_table(
        "rate_limit_buckets",
        sa.Column("key_hash", sa.String(length=64), primary_key=True),
        sa.Column("count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("count >= 0", name="ck_rate_limit_buckets_count_non_negative"),
    )
    op.create_index(
        "ix_rate_limit_buckets_expires_at", "rate_limit_buckets", ["expires_at"], unique=False
    )

    op.create_table(
        "workspace_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("invited_email", sa.String(length=320), nullable=False),
        sa.Column("invited_user_id", sa.Integer(), nullable=True),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("email_generation", sa.Integer(), server_default="1", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("declined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "role IN ('team_lead', 'member', 'viewer')",
            name="ck_workspace_invitations_role_allowed",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')",
            name="ck_workspace_invitations_status_allowed",
        ),
        sa.CheckConstraint(
            "email_generation >= 1", name="ck_workspace_invitations_generation_positive"
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_workspace_invitations_workspace_id",
        "workspace_invitations",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_workspace_invitations_invited_email",
        "workspace_invitations",
        ["invited_email"],
        unique=False,
    )
    op.create_index(
        "ix_workspace_invitations_invited_user_id",
        "workspace_invitations",
        ["invited_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_workspace_invitations_invited_by_user_id",
        "workspace_invitations",
        ["invited_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_workspace_invitations_status", "workspace_invitations", ["status"], unique=False
    )
    op.create_index(
        "ix_workspace_invitations_expires_at", "workspace_invitations", ["expires_at"], unique=False
    )
    op.create_index(
        "ix_workspace_invitations_token_hash", "workspace_invitations", ["token_hash"], unique=True
    )
    op.create_index(
        "uq_workspace_invitations_pending_email",
        "workspace_invitations",
        ["workspace_id", "invited_email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.add_column(
        "notifications",
        sa.Column("invitation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_notifications_invitation_id_workspace_invitations",
        "notifications",
        "workspace_invitations",
        ["invitation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_notifications_invitation_id", "notifications", ["invitation_id"], unique=False
    )
    op.drop_constraint("ck_notifications_type_allowed", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type_allowed",
        "notifications",
        "type IN ('deadline_soon', 'deadline_overdue', 'workspace_member_added', "
        "'workspace_member_removed', 'workspace_member_role_changed', "
        "'workspace_role_changed', 'workspace_invitation')",
    )

    op.add_column(
        "notification_deliveries",
        sa.Column("purpose", sa.String(length=32), server_default="notification", nullable=False),
    )
    op.add_column(
        "notification_deliveries", sa.Column("source_id", sa.String(length=64), nullable=True)
    )
    op.create_index(
        "ix_notification_deliveries_purpose", "notification_deliveries", ["purpose"], unique=False
    )
    op.create_index(
        "ix_notification_deliveries_source_id",
        "notification_deliveries",
        ["source_id"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_notification_deliveries_purpose_allowed",
        "notification_deliveries",
        "purpose IN ('notification', 'workspace_invitation', 'registration_verification')",
    )
    op.alter_column("notification_deliveries", "notification_id", nullable=True)
    op.drop_constraint(
        "fk_notification_deliveries_user_id_users",
        "notification_deliveries",
        type_="foreignkey",
    )
    op.alter_column("notification_deliveries", "user_id", nullable=True)
    op.create_foreign_key(
        "fk_notification_deliveries_user_id_users",
        "notification_deliveries",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute("DELETE FROM notification_deliveries WHERE purpose != 'notification'")
    op.drop_constraint(
        "fk_notification_deliveries_user_id_users", "notification_deliveries", type_="foreignkey"
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
    op.alter_column("notification_deliveries", "notification_id", nullable=False)
    op.drop_constraint(
        "ck_notification_deliveries_purpose_allowed", "notification_deliveries", type_="check"
    )
    op.drop_index("ix_notification_deliveries_source_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_purpose", table_name="notification_deliveries")
    op.drop_column("notification_deliveries", "source_id")
    op.drop_column("notification_deliveries", "purpose")

    op.execute("DELETE FROM notifications WHERE type = 'workspace_invitation'")
    op.drop_constraint("ck_notifications_type_allowed", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type_allowed",
        "notifications",
        "type IN ('deadline_soon', 'deadline_overdue', 'workspace_member_added', "
        "'workspace_member_removed', 'workspace_member_role_changed', 'workspace_role_changed')",
    )
    op.drop_index("ix_notifications_invitation_id", table_name="notifications")
    op.drop_constraint(
        "fk_notifications_invitation_id_workspace_invitations", "notifications", type_="foreignkey"
    )
    op.drop_column("notifications", "invitation_id")

    for index_name in (
        "uq_workspace_invitations_pending_email",
        "ix_workspace_invitations_token_hash",
        "ix_workspace_invitations_expires_at",
        "ix_workspace_invitations_status",
        "ix_workspace_invitations_invited_by_user_id",
        "ix_workspace_invitations_invited_user_id",
        "ix_workspace_invitations_invited_email",
        "ix_workspace_invitations_workspace_id",
    ):
        op.drop_index(index_name, table_name="workspace_invitations")
    op.drop_table("workspace_invitations")
    op.drop_index("ix_rate_limit_buckets_expires_at", table_name="rate_limit_buckets")
    op.drop_table("rate_limit_buckets")
    for index_name in (
        "ix_pending_registrations_consumed_at",
        "ix_pending_registrations_expires_at",
        "ix_pending_registrations_username",
        "ix_pending_registrations_email",
    ):
        op.drop_index(index_name, table_name="pending_registrations")
    op.drop_table("pending_registrations")
    op.drop_index("ix_users_email_verified", table_name="users")
    op.drop_column("users", "email_verified")
