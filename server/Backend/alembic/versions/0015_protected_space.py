"""add protected personal space"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015_protected_space"
down_revision: str | None = "0014_db_integrity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("is_protected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_workspaces_is_protected",
        "workspaces",
        ["is_protected"],
        unique=False,
    )
    op.create_index(
        "ix_workspaces_owner_id_is_protected",
        "workspaces",
        ["owner_id", "is_protected"],
        unique=False,
    )

    op.create_table(
        "protected_space_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
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
        sa.Column("last_unlocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.CheckConstraint("failed_attempts >= 0", name="ck_protected_settings_failed_attempts"),
        sa.UniqueConstraint("user_id", name="uq_protected_settings_user_id"),
        sa.UniqueConstraint("workspace_id", name="uq_protected_settings_workspace_id"),
    )
    op.create_index(
        "ix_protected_settings_user_id",
        "protected_space_settings",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_protected_settings_workspace_id",
        "protected_space_settings",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_protected_settings_user_workspace",
        "protected_space_settings",
        ["user_id", "workspace_id"],
        unique=False,
    )

    op.create_table(
        "protected_space_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("session_token_hash", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_hash", sa.String(length=128), nullable=True),
        sa.Column("user_agent_hash", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "expires_at > created_at",
            name="ck_protected_sessions_expires_after_create",
        ),
    )
    op.create_index(
        "ix_protected_sessions_user_id",
        "protected_space_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_protected_sessions_workspace_id",
        "protected_space_sessions",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_protected_sessions_user_workspace",
        "protected_space_sessions",
        ["user_id", "workspace_id"],
        unique=False,
    )
    op.create_index(
        "ix_protected_sessions_token_hash",
        "protected_space_sessions",
        ["session_token_hash"],
        unique=False,
    )
    op.create_index(
        "ux_protected_sessions_active_token",
        "protected_space_sessions",
        ["session_token_hash"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_protected_sessions_active_token", table_name="protected_space_sessions")
    op.drop_index("ix_protected_sessions_token_hash", table_name="protected_space_sessions")
    op.drop_index("ix_protected_sessions_user_workspace", table_name="protected_space_sessions")
    op.drop_index("ix_protected_sessions_workspace_id", table_name="protected_space_sessions")
    op.drop_index("ix_protected_sessions_user_id", table_name="protected_space_sessions")
    op.drop_table("protected_space_sessions")

    op.drop_index("ix_protected_settings_user_workspace", table_name="protected_space_settings")
    op.drop_index("ix_protected_settings_workspace_id", table_name="protected_space_settings")
    op.drop_index("ix_protected_settings_user_id", table_name="protected_space_settings")
    op.drop_table("protected_space_settings")

    op.drop_index("ix_workspaces_owner_id_is_protected", table_name="workspaces")
    op.drop_index("ix_workspaces_is_protected", table_name="workspaces")
    op.drop_column("workspaces", "is_protected")
