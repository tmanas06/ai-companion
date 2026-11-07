"""privy_auth

Revision ID: 006
Revises: 005
Create Date: 2026-11-06 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("privy_id", sa.String(length=100), nullable=True))
    op.create_index("ix_users_privy_id", "users", ["privy_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_privy_id", table_name="users")
    op.drop_column("users", "privy_id")

