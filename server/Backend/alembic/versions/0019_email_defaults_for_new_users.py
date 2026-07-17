"""Enable deadline email defaults for newly inserted users only."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_email_defaults"
down_revision: str | None = "0018_invites_verify"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMAIL_PREFERENCE_COLUMNS = (
    "email_notifications_enabled",
    "email_deadline_24h",
    "email_deadline_1h",
    "email_deadline_overdue",
)


def upgrade() -> None:
    # Do not update existing rows: false may be an explicit opt-out.
    for column_name in EMAIL_PREFERENCE_COLUMNS:
        op.alter_column(
            "users",
            column_name,
            existing_type=sa.Boolean(),
            existing_nullable=False,
            server_default=sa.true(),
        )


def downgrade() -> None:
    for column_name in EMAIL_PREFERENCE_COLUMNS:
        op.alter_column(
            "users",
            column_name,
            existing_type=sa.Boolean(),
            existing_nullable=False,
            server_default=sa.false(),
        )
