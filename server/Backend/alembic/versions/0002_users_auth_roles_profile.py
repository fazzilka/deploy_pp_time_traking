"""add users auth roles and task ownership"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_users_auth_roles_profile"
down_revision: Union[str, None] = "b25778ee8fd4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


create_user_role_enum = postgresql.ENUM("user", "admin", name="user_role")
user_role_enum = postgresql.ENUM("user", "admin", name="user_role", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    create_user_role_enum.create(bind, checkfirst=True)
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", user_role_enum, nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_role", "users", ["role"], unique=False)

    op.add_column("tasks", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(
        """
        INSERT INTO users (email, username, full_name, hashed_password, role, is_active)
        SELECT
            'legacy@example.local',
            'legacy',
            'Legacy User',
            'disabled',
            'user',
            false
        WHERE EXISTS (SELECT 1 FROM tasks)
          AND NOT EXISTS (
              SELECT 1 FROM users
              WHERE email = 'legacy@example.local' OR username = 'legacy'
          )
        """
    )
    op.execute(
        """
        UPDATE tasks
        SET user_id = (SELECT id FROM users WHERE username = 'legacy')
        WHERE user_id IS NULL
        """
    )
    op.alter_column("tasks", "user_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        "fk_tasks_user_id_users",
        "tasks",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_user_id", table_name="tasks")
    op.drop_constraint("fk_tasks_user_id_users", "tasks", type_="foreignkey")
    op.drop_column("tasks", "user_id")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    create_user_role_enum.drop(op.get_bind(), checkfirst=True)
