"""phase1_models

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, CITEXT
import pgvector

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Companions table
    op.create_table(
        "companions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=False),
        sa.Column("personality", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("llm_config", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Index on user_id created automatically via index=True on column

    # Conversations table
    op.create_table(
        "conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("companion_id", UUID(as_uuid=True), sa.ForeignKey("companions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("message_count", sa.Integer, default=0, nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_conversations_last_message_at", "conversations", ["last_message_at"])
    op.create_index("ix_conversations_deleted_at", "conversations", ["deleted_at"], postgresql_where=sa.text("deleted_at IS NOT NULL"))

    # Messages table
    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.Enum("user", "assistant", "system", "tool", name="message_role"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("tool_calls", sa.JSON, nullable=True),
        sa.Column("tool_call_id", sa.String(100), nullable=True),
        sa.Column("metadata", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Index on conversation_id created automatically via index=True on column
    op.create_index("ix_messages_created_at", "messages", ["created_at"])

    # Memories table
    op.create_table(
        "memories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("companion_id", UUID(as_uuid=True), sa.ForeignKey("companions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("memory_type", sa.Enum("preference", "fact", "event", "relationship", "goal", "correction", name="memory_type"), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("source", sa.Enum("user_explicit", "user_correction", "model_inference", "conversation_summary", name="memory_source"), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False, server_default="0.5"),
        sa.Column("is_sensitive", sa.Boolean, default=False, nullable=False),
        sa.Column("consent_status", sa.Enum("pending", "approved", "denied", "auto_approved", name="consent_status"), nullable=False, server_default="pending"),
        sa.Column("consent_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_granted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(1536), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("superseded_by", UUID(as_uuid=True), sa.ForeignKey("memories.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_memories_memory_type", "memories", ["memory_type"])
    op.create_index("ix_memories_consent_status", "memories", ["consent_status"])
    op.create_index("ix_memories_is_sensitive", "memories", ["is_sensitive"])
    op.create_index("ix_memories_deleted_at", "memories", ["deleted_at"], postgresql_where=sa.text("deleted_at IS NOT NULL"))

    # Avatars table
    op.create_table(
        "avatars",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("config_version", sa.Integer, default=1, nullable=False),
        sa.Column("config", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("preview_url", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Index on user_id created automatically via index=True on column

    # Avatar assets table
    op.create_table(
        "avatar_assets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("layer_type", sa.String(50), nullable=False),
        sa.Column("variant", sa.String(100), nullable=False),
        sa.Column("asset_url", sa.String(500), nullable=False),
        sa.Column("metadata", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_avatar_assets_layer_variant", "avatar_assets", ["layer_type", "variant"], unique=True)

    # Audit logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", UUID(as_uuid=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("metadata", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Index on user_id created automatically via index=True on column
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # HNSW index for vector similarity search (created after table)
    op.execute("CREATE INDEX IF NOT EXISTS ix_memories_embedding_hnsw ON memories USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL AND deleted_at IS NULL;")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memories_embedding_hnsw;")
    op.drop_table("audit_logs")
    op.drop_table("avatar_assets")
    op.drop_table("avatars")
    op.drop_table("memories")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("companions")
    # Drop enum types
    op.execute("DROP TYPE IF EXISTS message_role;")
    op.execute("DROP TYPE IF EXISTS memory_type;")
    op.execute("DROP TYPE IF EXISTS memory_source;")
    op.execute("DROP TYPE IF EXISTS consent_status;")