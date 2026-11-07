"""google_auth_and_wallet

Revision ID: 005
Revises: 004
Create Date: 2026-11-06 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add wallet_address, encrypted_wallet_key, and google_id to users table
    op.add_column("users", sa.Column("wallet_address", sa.String(length=42), nullable=True))
    op.add_column("users", sa.Column("encrypted_wallet_key", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_id", sa.String(length=100), nullable=True))

    op.create_index("ix_users_wallet_address", "users", ["wallet_address"], unique=True)
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_index("ix_users_wallet_address", table_name="users")
    op.drop_column("users", "google_id")
    op.drop_column("users", "encrypted_wallet_key")
    op.drop_column("users", "wallet_address")

