"""make task deadlines timezone aware"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_deadline_tz"
down_revision: str | None = "0012_perf_workspace_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "tasks",
        "deadline",
        existing_type=sa.Date(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="((deadline::date + time '23:59:59.999999') AT TIME ZONE 'Europe/Moscow')",
    )


def downgrade() -> None:
    op.alter_column(
        "tasks",
        "deadline",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Date(),
        existing_nullable=True,
        postgresql_using="deadline::date",
    )
