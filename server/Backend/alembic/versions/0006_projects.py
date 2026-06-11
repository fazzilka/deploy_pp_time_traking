"""add projects"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_projects"
down_revision: str | None = "0005_performance_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=16), nullable=False, server_default="#2ea043"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("owner_id", "name", name="uq_projects_owner_id_name"),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"], unique=False)
    op.create_index(
        "ix_projects_owner_id_created_at",
        "projects",
        ["owner_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_projects_owner_id_is_archived",
        "projects",
        ["owner_id", "is_archived"],
        unique=False,
    )
    op.create_index("ix_projects_is_archived", "projects", ["is_archived"], unique=False)

    op.add_column("tasks", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_project_id_projects",
        "tasks",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"], unique=False)
    op.create_index(
        "ix_tasks_user_id_project_id",
        "tasks",
        ["user_id", "project_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_user_id_project_id", table_name="tasks")
    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_constraint("fk_tasks_project_id_projects", "tasks", type_="foreignkey")
    op.drop_column("tasks", "project_id")

    op.drop_index("ix_projects_is_archived", table_name="projects")
    op.drop_index("ix_projects_owner_id_is_archived", table_name="projects")
    op.drop_index("ix_projects_owner_id_created_at", table_name="projects")
    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_table("projects")
