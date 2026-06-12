"""add project icons"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_project_icons"
down_revision: str | None = "0007_task_completion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("icon", sa.String(length=64), nullable=False, server_default="folder"),
    )


def downgrade() -> None:
    op.drop_column("projects", "icon")
