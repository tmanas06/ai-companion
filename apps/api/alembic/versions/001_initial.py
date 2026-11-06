"""initial

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, CITEXT
import pgvector

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS vector;')
    op.execute('CREATE EXTENSION IF NOT EXISTS citext;')

    # Users table
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", CITEXT, unique=True, nullable=False, index=True),
        sa.Column("email_verified", sa.Boolean, default=False, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=True),
        sa.Column("full_name", sa.String(100), nullable=True),
        sa.Column("avatar_id", UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"], postgresql_where=sa.text("deleted_at IS NOT NULL"))


def downgrade() -> None:
    op.drop_table("users")
    op.execute('DROP EXTENSION IF EXISTS vector;')