"""add workspace performance indexes"""

from collections.abc import Sequence

from alembic import op

revision: str = "0012_performance_workspace_indexes"
down_revision: str | None = "0011_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_tasks_workspace_id_is_completed",
        "tasks",
        ["workspace_id", "is_completed"],
        unique=False,
    )
    op.create_index(
        "ix_tasks_workspace_id_deadline",
        "tasks",
        ["workspace_id", "deadline"],
        unique=False,
    )
    op.create_index(
        "ix_notifications_user_id_is_read_created_at",
        "notifications",
        ["user_id", "is_read", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id_is_read_created_at", table_name="notifications")
    op.drop_index("ix_tasks_workspace_id_deadline", table_name="tasks")
    op.drop_index("ix_tasks_workspace_id_is_completed", table_name="tasks")
