"""add task comments"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_task_comments"
down_revision: str | None = "0015_protected_space"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "task_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "(deleted_at IS NULL AND deleted_by_id IS NULL) "
            "OR (deleted_at IS NOT NULL AND deleted_by_id IS NOT NULL)",
            name="ck_task_comments_deleted_consistency",
        ),
    )
    op.create_index("ix_task_comments_task_id", "task_comments", ["task_id"], unique=False)
    op.create_index(
        "ix_task_comments_workspace_id",
        "task_comments",
        ["workspace_id"],
        unique=False,
    )
    op.create_index("ix_task_comments_author_id", "task_comments", ["author_id"], unique=False)
    op.create_index(
        "ix_task_comments_created_at",
        "task_comments",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_task_comments_task_id_created_at",
        "task_comments",
        ["task_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_task_comments_workspace_id_created_at",
        "task_comments",
        ["workspace_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_task_comments_author_id_created_at",
        "task_comments",
        ["author_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_task_comments_author_id_created_at", table_name="task_comments")
    op.drop_index("ix_task_comments_workspace_id_created_at", table_name="task_comments")
    op.drop_index("ix_task_comments_task_id_created_at", table_name="task_comments")
    op.drop_index("ix_task_comments_created_at", table_name="task_comments")
    op.drop_index("ix_task_comments_author_id", table_name="task_comments")
    op.drop_index("ix_task_comments_workspace_id", table_name="task_comments")
    op.drop_index("ix_task_comments_task_id", table_name="task_comments")
    op.drop_table("task_comments")
