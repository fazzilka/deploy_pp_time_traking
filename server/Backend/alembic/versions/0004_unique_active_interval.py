"""ensure one active interval per task"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_unique_active_interval"
down_revision: Union[str, None] = "0003_task_deadline_priority"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ux_time_intervals_one_active_per_task",
        "time_intervals",
        ["task_id"],
        unique=True,
        postgresql_where=sa.text("finished_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_time_intervals_one_active_per_task", table_name="time_intervals")
