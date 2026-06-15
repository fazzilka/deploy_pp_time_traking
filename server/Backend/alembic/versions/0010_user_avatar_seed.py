"""add user avatar seed"""

import hashlib
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_user_avatar_seed"
down_revision: str | None = "0009_workspaces"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_seed", sa.String(length=128), nullable=True))

    connection = op.get_bind()
    users = connection.execute(
        sa.text("SELECT id, email, username, created_at FROM users WHERE avatar_seed IS NULL")
    )
    for user_id, email, username, created_at in users:
        raw_seed = f"{user_id}:{email}:{username}:{created_at}"
        avatar_seed = hashlib.sha256(raw_seed.encode("utf-8")).hexdigest()
        connection.execute(
            sa.text("UPDATE users SET avatar_seed = :avatar_seed WHERE id = :user_id"),
            {"avatar_seed": avatar_seed, "user_id": user_id},
        )

    op.alter_column(
        "users",
        "avatar_seed",
        existing_type=sa.String(length=128),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_seed")
