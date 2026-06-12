"""add task completion flag"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_task_completion"
down_revision: str | None = "0006_projects"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_tasks_is_completed", "tasks", ["is_completed"], unique=False)
    op.create_index(
        "ix_tasks_user_id_is_completed",
        "tasks",
        ["user_id", "is_completed"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_user_id_is_completed", table_name="tasks")
    op.drop_index("ix_tasks_is_completed", table_name="tasks")
    op.drop_column("tasks", "is_completed")
