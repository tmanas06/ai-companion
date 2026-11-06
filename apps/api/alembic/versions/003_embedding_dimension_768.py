"""embedding_dimension_768

Revision ID: 003
Revises: 002
Create Date: 2026-10-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import pgvector

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely drop existing HNSW index, alter vector dimension from 1536 to 768 for nomic-embed-text,
    # and recreate HNSW index with vector_cosine_ops
    op.execute("DROP INDEX IF EXISTS ix_memories_embedding_hnsw;")
    op.execute("ALTER TABLE memories ALTER COLUMN embedding TYPE vector(768);")
    op.execute(
        "CREATE INDEX ix_memories_embedding_hnsw ON memories USING hnsw (embedding vector_cosine_ops) "
        "WHERE ((embedding IS NOT NULL) AND (deleted_at IS NULL));"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memories_embedding_hnsw;")
    op.execute("ALTER TABLE memories ALTER COLUMN embedding TYPE vector(1536);")
    op.execute(
        "CREATE INDEX ix_memories_embedding_hnsw ON memories USING hnsw (embedding vector_cosine_ops) "
        "WHERE ((embedding IS NOT NULL) AND (deleted_at IS NULL));"
    )
