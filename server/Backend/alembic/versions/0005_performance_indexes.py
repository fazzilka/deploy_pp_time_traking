"""add performance indexes"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_performance_indexes"
down_revision: Union[str, None] = "0004_unique_active_interval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column(
        "tasks",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_tasks_created_at", "tasks", ["created_at"], unique=False)
    op.create_index("ix_tasks_updated_at", "tasks", ["updated_at"], unique=False)
    op.create_index("ix_tasks_user_id_created_at", "tasks", ["user_id", "created_at"], unique=False)
    op.create_index("ix_tasks_user_id_deadline", "tasks", ["user_id", "deadline"], unique=False)
    op.create_index("ix_tasks_user_id_priority", "tasks", ["user_id", "priority"], unique=False)
    op.create_index(
        "ix_tasks_user_id_total_time_seconds",
        "tasks",
        ["user_id", "total_time_seconds"],
        unique=False,
    )

    op.create_index("ix_time_intervals_task_id", "time_intervals", ["task_id"], unique=False)
    op.create_index("ix_time_intervals_started_at", "time_intervals", ["started_at"], unique=False)
    op.create_index("ix_time_intervals_finished_at", "time_intervals", ["finished_at"], unique=False)
    op.create_index(
        "ix_time_intervals_task_id_started_at",
        "time_intervals",
        ["task_id", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_time_intervals_started_at_finished_at",
        "time_intervals",
        ["started_at", "finished_at"],
        unique=False,
    )

    op.create_index("ix_users_is_active", "users", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_is_active", table_name="users")

    op.drop_index("ix_time_intervals_started_at_finished_at", table_name="time_intervals")
    op.drop_index("ix_time_intervals_task_id_started_at", table_name="time_intervals")
    op.drop_index("ix_time_intervals_finished_at", table_name="time_intervals")
    op.drop_index("ix_time_intervals_started_at", table_name="time_intervals")
    op.drop_index("ix_time_intervals_task_id", table_name="time_intervals")

    op.drop_index("ix_tasks_user_id_total_time_seconds", table_name="tasks")
    op.drop_index("ix_tasks_user_id_priority", table_name="tasks")
    op.drop_index("ix_tasks_user_id_deadline", table_name="tasks")
    op.drop_index("ix_tasks_user_id_created_at", table_name="tasks")
    op.drop_index("ix_tasks_updated_at", table_name="tasks")
    op.drop_index("ix_tasks_created_at", table_name="tasks")
    op.drop_column("tasks", "updated_at")
    op.drop_column("tasks", "created_at")
