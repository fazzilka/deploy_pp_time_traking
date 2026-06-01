"""create tasks and time intervals"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_tasks_intervals"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("total_time_seconds", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.create_index("ix_tasks_title", "tasks", ["title"], unique=False)
    op.create_table(
        "time_intervals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_time_intervals_task_id_finished_at",
        "time_intervals",
        ["task_id", "finished_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_time_intervals_task_id_finished_at", table_name="time_intervals")
    op.drop_table("time_intervals")
    op.drop_index("ix_tasks_title", table_name="tasks")
    op.drop_table("tasks")
