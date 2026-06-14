"""add team workspaces"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_workspaces"
down_revision: str | None = "0008_project_icons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", sa.String(length=32), nullable=False, server_default="personal"),
        sa.Column("owner_id", sa.Integer(), nullable=False),
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
    )
    op.create_index("ix_workspaces_owner_id", "workspaces", ["owner_id"], unique=False)
    op.create_index("ix_workspaces_owner_id_type", "workspaces", ["owner_id", "type"], unique=False)
    op.create_index("ix_workspaces_type", "workspaces", ["type"], unique=False)

    op.create_table(
        "workspace_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
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
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
    )
    op.create_index(
        "ix_workspace_members_workspace_id",
        "workspace_members",
        ["workspace_id"],
        unique=False,
    )
    op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"], unique=False)
    op.create_index(
        "ix_workspace_members_workspace_id_status",
        "workspace_members",
        ["workspace_id", "status"],
        unique=False,
    )
    op.create_index("ix_workspace_members_role", "workspace_members", ["role"], unique=False)
    op.create_index("ix_workspace_members_status", "workspace_members", ["status"], unique=False)

    op.add_column("projects", sa.Column("workspace_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_projects_workspace_id_workspaces",
        "projects",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"], unique=False)
    op.create_index(
        "ix_projects_workspace_id_is_archived",
        "projects",
        ["workspace_id", "is_archived"],
        unique=False,
    )

    op.add_column("tasks", sa.Column("workspace_id", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("created_by_id", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("assignee_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_workspace_id_workspaces",
        "tasks",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_tasks_created_by_id_users",
        "tasks",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_tasks_assignee_id_users",
        "tasks",
        "users",
        ["assignee_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tasks_workspace_id", "tasks", ["workspace_id"], unique=False)
    op.create_index("ix_tasks_created_by_id", "tasks", ["created_by_id"], unique=False)
    op.create_index("ix_tasks_assignee_id", "tasks", ["assignee_id"], unique=False)
    op.create_index(
        "ix_tasks_workspace_id_project_id",
        "tasks",
        ["workspace_id", "project_id"],
        unique=False,
    )
    op.create_index(
        "ix_tasks_workspace_id_assignee_id",
        "tasks",
        ["workspace_id", "assignee_id"],
        unique=False,
    )

    op.add_column("time_intervals", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_time_intervals_user_id_users",
        "time_intervals",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_time_intervals_user_id", "time_intervals", ["user_id"], unique=False)

    op.execute(
        """
        INSERT INTO workspaces (name, description, type, owner_id)
        SELECT 'Личное пространство', NULL, 'personal', users.id
        FROM users
        WHERE NOT EXISTS (
            SELECT 1
            FROM workspaces
            WHERE workspaces.owner_id = users.id AND workspaces.type = 'personal'
        )
        """
    )
    op.execute(
        """
        INSERT INTO workspace_members (workspace_id, user_id, role, status)
        SELECT workspaces.id, workspaces.owner_id, 'owner', 'active'
        FROM workspaces
        WHERE workspaces.type = 'personal'
          AND NOT EXISTS (
              SELECT 1
              FROM workspace_members
              WHERE workspace_members.workspace_id = workspaces.id
                AND workspace_members.user_id = workspaces.owner_id
          )
        """
    )
    op.execute(
        """
        UPDATE projects
        SET workspace_id = (
            SELECT workspaces.id
            FROM workspaces
            WHERE workspaces.owner_id = projects.owner_id
              AND workspaces.type = 'personal'
            ORDER BY workspaces.id ASC
            LIMIT 1
        )
        WHERE workspace_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE tasks
        SET workspace_id = (
                SELECT workspaces.id
                FROM workspaces
                WHERE workspaces.owner_id = tasks.user_id
                  AND workspaces.type = 'personal'
                ORDER BY workspaces.id ASC
                LIMIT 1
            ),
            created_by_id = user_id,
            assignee_id = user_id
        WHERE workspace_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE time_intervals
        SET user_id = (
            SELECT tasks.user_id
            FROM tasks
            WHERE tasks.id = time_intervals.task_id
        )
        WHERE user_id IS NULL
        """
    )

    op.alter_column("projects", "workspace_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("tasks", "workspace_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("time_intervals", "user_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    op.alter_column("time_intervals", "user_id", existing_type=sa.Integer(), nullable=True)
    op.drop_index("ix_time_intervals_user_id", table_name="time_intervals")
    op.drop_constraint("fk_time_intervals_user_id_users", "time_intervals", type_="foreignkey")
    op.drop_column("time_intervals", "user_id")

    op.drop_index("ix_tasks_workspace_id_assignee_id", table_name="tasks")
    op.drop_index("ix_tasks_workspace_id_project_id", table_name="tasks")
    op.drop_index("ix_tasks_assignee_id", table_name="tasks")
    op.drop_index("ix_tasks_created_by_id", table_name="tasks")
    op.drop_index("ix_tasks_workspace_id", table_name="tasks")
    op.drop_constraint("fk_tasks_assignee_id_users", "tasks", type_="foreignkey")
    op.drop_constraint("fk_tasks_created_by_id_users", "tasks", type_="foreignkey")
    op.drop_constraint("fk_tasks_workspace_id_workspaces", "tasks", type_="foreignkey")
    op.drop_column("tasks", "assignee_id")
    op.drop_column("tasks", "created_by_id")
    op.drop_column("tasks", "workspace_id")

    op.drop_index("ix_projects_workspace_id_is_archived", table_name="projects")
    op.drop_index("ix_projects_workspace_id", table_name="projects")
    op.drop_constraint("fk_projects_workspace_id_workspaces", "projects", type_="foreignkey")
    op.drop_column("projects", "workspace_id")

    op.drop_index("ix_workspace_members_status", table_name="workspace_members")
    op.drop_index("ix_workspace_members_role", table_name="workspace_members")
    op.drop_index("ix_workspace_members_workspace_id_status", table_name="workspace_members")
    op.drop_index("ix_workspace_members_user_id", table_name="workspace_members")
    op.drop_index("ix_workspace_members_workspace_id", table_name="workspace_members")
    op.drop_table("workspace_members")

    op.drop_index("ix_workspaces_type", table_name="workspaces")
    op.drop_index("ix_workspaces_owner_id_type", table_name="workspaces")
    op.drop_index("ix_workspaces_owner_id", table_name="workspaces")
    op.drop_table("workspaces")
