"""add task deadline and priority"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_task_deadline_priority"
down_revision: Union[str, None] = "0002_users_auth_roles_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("deadline", sa.Date(), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
    )
    op.create_index("ix_tasks_deadline", "tasks", ["deadline"], unique=False)
    op.create_index("ix_tasks_priority", "tasks", ["priority"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_priority", table_name="tasks")
    op.drop_index("ix_tasks_deadline", table_name="tasks")
    op.drop_column("tasks", "priority")
    op.drop_column("tasks", "deadline")
