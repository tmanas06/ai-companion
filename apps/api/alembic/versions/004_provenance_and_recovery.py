"""provenance_and_recovery

Revision ID: 004
Revises: 003
Create Date: 2026-10-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add source_message_id to memories table for message-level provenance
    op.add_column(
        "memories",
        sa.Column(
            "source_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_memories_source_message_id",
        "memories",
        ["source_message_id"],
    )

    # 2. Add last_extracted_message_id to conversations table for idempotent progress tracking
    op.add_column(
        "conversations",
        sa.Column(
            "last_extracted_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    # 1. Remove last_extracted_message_id from conversations table
    op.drop_column("conversations", "last_extracted_message_id")

    # 2. Remove source_message_id index and column from memories table
    op.drop_index("ix_memories_source_message_id", table_name="memories")
    op.drop_column("memories", "source_message_id")
