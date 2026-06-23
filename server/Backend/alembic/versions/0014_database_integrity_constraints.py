"""add database integrity constraints"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_db_integrity"
down_revision: str | None = "0013_deadline_tz"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_users_role_allowed",
        "users",
        "role IN ('user', 'admin')",
    )
    op.create_check_constraint(
        "ck_workspaces_type_allowed",
        "workspaces",
        "type IN ('personal', 'team')",
    )
    op.create_check_constraint(
        "ck_workspace_members_role_allowed",
        "workspace_members",
        "role IN ('owner', 'team_lead', 'member', 'viewer')",
    )
    op.create_check_constraint(
        "ck_workspace_members_status_allowed",
        "workspace_members",
        "status IN ('active', 'inactive')",
    )
    op.create_index(
        "ix_workspace_members_workspace_id_role_status",
        "workspace_members",
        ["workspace_id", "role", "status"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_projects_name_not_blank",
        "projects",
        "char_length(name) > 0",
    )
    op.create_check_constraint(
        "ck_tasks_total_time_non_negative",
        "tasks",
        "total_time_seconds >= 0",
    )
    op.create_check_constraint(
        "ck_tasks_priority_allowed",
        "tasks",
        "priority IN ('lowest', 'low', 'medium', 'high', 'highest')",
    )
    op.create_check_constraint(
        "ck_time_intervals_finished_after_started",
        "time_intervals",
        "finished_at IS NULL OR finished_at >= started_at",
    )
    op.create_index(
        "ix_time_intervals_user_id_finished_at",
        "time_intervals",
        ["user_id", "finished_at"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_notifications_type_allowed",
        "notifications",
        (
            "type IN ("
            "'deadline_soon', "
            "'deadline_overdue', "
            "'workspace_member_added', "
            "'workspace_member_removed', "
            "'workspace_member_role_changed', "
            "'workspace_role_changed'"
            ")"
        ),
    )
    op.create_check_constraint(
        "ck_notifications_unread_without_read_at",
        "notifications",
        "is_read = true OR read_at IS NULL",
    )
    op.create_check_constraint(
        "ck_notification_deliveries_channel_allowed",
        "notification_deliveries",
        "channel IN ('email', 'telegram')",
    )
    op.create_check_constraint(
        "ck_notification_deliveries_status_allowed",
        "notification_deliveries",
        "status IN ('pending', 'sent', 'failed', 'skipped')",
    )
    op.create_check_constraint(
        "ck_notification_deliveries_attempts_non_negative",
        "notification_deliveries",
        "attempts >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_notification_deliveries_attempts_non_negative",
        "notification_deliveries",
        type_="check",
    )
    op.drop_constraint(
        "ck_notification_deliveries_status_allowed",
        "notification_deliveries",
        type_="check",
    )
    op.drop_constraint(
        "ck_notification_deliveries_channel_allowed",
        "notification_deliveries",
        type_="check",
    )
    op.drop_constraint(
        "ck_notifications_unread_without_read_at",
        "notifications",
        type_="check",
    )
    op.drop_constraint("ck_notifications_type_allowed", "notifications", type_="check")
    op.drop_index("ix_time_intervals_user_id_finished_at", table_name="time_intervals")
    op.drop_constraint(
        "ck_time_intervals_finished_after_started",
        "time_intervals",
        type_="check",
    )
    op.drop_constraint("ck_tasks_priority_allowed", "tasks", type_="check")
    op.drop_constraint("ck_tasks_total_time_non_negative", "tasks", type_="check")
    op.drop_constraint("ck_projects_name_not_blank", "projects", type_="check")
    op.drop_index(
        "ix_workspace_members_workspace_id_role_status",
        table_name="workspace_members",
    )
    op.drop_constraint(
        "ck_workspace_members_status_allowed",
        "workspace_members",
        type_="check",
    )
    op.drop_constraint(
        "ck_workspace_members_role_allowed",
        "workspace_members",
        type_="check",
    )
    op.drop_constraint("ck_workspaces_type_allowed", "workspaces", type_="check")
    op.drop_constraint("ck_users_role_allowed", "users", type_="check")
