from datetime import UTC, datetime
from enum import Enum as PyEnum
from typing import Optional
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Enum as SQLEnum, ForeignKey, Index, JSON, String, Text
from sqlalchemy.dialects.postgresql import CITEXT, UUID as PG_UUID
from sqlmodel import Field, SQLModel
import sqlalchemy as sa


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    email: str = Field(
        sa_column=Column(CITEXT, unique=True, nullable=False, index=True),
    )
    email_verified: bool = Field(default=False)
    password_hash: Optional[str] = Field(default=None)
    full_name: Optional[str] = Field(default=None, max_length=100)
    avatar_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PG_UUID(as_uuid=True), nullable=True),
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    deleted_at: Optional[datetime] = Field(default=None)


class Companion(SQLModel, table=True):
    __tablename__ = "companions"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    user_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str = Field(sa_column=Column(String(100), nullable=False))
    system_prompt: str = Field(sa_column=Column(Text, nullable=False))
    personality: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
    llm_config: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )

    __table_args__ = (
        Index("ix_companions_user_id", "user_id"),
    )


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    user_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    companion_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("companions.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    title: Optional[str] = Field(default=None, max_length=500)
    summary: Optional[str] = Field(default=None)
    message_count: int = Field(default=0)
    last_message_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    deleted_at: Optional[datetime] = Field(default=None)

    __table_args__ = (
        Index("ix_conversations_user_id", "user_id"),
        Index("ix_conversations_companion_id", "companion_id"),
        Index("ix_conversations_last_message_at", "last_message_at"),
    )


class MessageRole(str, PyEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    conversation_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    role: MessageRole = Field(
        sa_column=Column(
            sa.Enum(MessageRole, name="message_role", values_callable=lambda x: [e.value for e in x]),
            nullable=False,
        )
    )
    content: str = Field(sa_column=Column(Text, nullable=False))
    token_count: Optional[int] = Field(default=None)
    model: Optional[str] = Field(default=None, max_length=100)
    tool_calls: Optional[dict] = Field(default=None, sa_column=Column(sa.JSON, nullable=True))
    metadata_: dict = Field(default_factory=dict, sa_column=Column("metadata", sa.JSON, nullable=False))

    @property
    def metadata(self) -> dict:
        return self.metadata_

    @metadata.setter
    def metadata(self, value: dict) -> None:
        self.metadata_ = value

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )

    __table_args__ = (
        Index("ix_messages_conversation_id", "conversation_id"),
        Index("ix_messages_created_at", "created_at"),
    )


class MemoryType(str, PyEnum):
    PREFERENCE = "preference"
    FACT = "fact"
    EVENT = "event"
    RELATIONSHIP = "relationship"
    GOAL = "goal"
    CORRECTION = "correction"


class MemorySource(str, PyEnum):
    USER_EXPLICIT = "user_explicit"
    USER_CORRECTION = "user_correction"
    MODEL_INFERENCE = "model_inference"
    CONVERSATION_SUMMARY = "conversation_summary"


class ConsentStatus(str, PyEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    AUTO_APPROVED = "auto_approved"


class Memory(SQLModel, table=True):
    __tablename__ = "memories"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    user_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    companion_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("companions.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    conversation_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    content: str = Field(sa_column=Column(Text, nullable=False))
    memory_type: MemoryType = Field(sa_column=Column(sa.Enum(MemoryType), nullable=False))
    category: Optional[str] = Field(default=None, max_length=100)
    source: MemorySource = Field(sa_column=Column(sa.Enum(MemorySource), nullable=False))
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    is_sensitive: bool = Field(default=False)
    consent_status: ConsentStatus = Field(
        sa_column=Column(sa.Enum(ConsentStatus), nullable=False),
        default=ConsentStatus.PENDING,
    )
    consent_requested_at: Optional[datetime] = Field(default=None)
    consent_granted_at: Optional[datetime] = Field(default=None)
    embedding: Optional[list[float]] = Field(
        default=None,
        sa_column=Column(Vector(1536), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    deleted_at: Optional[datetime] = Field(default=None)
    superseded_by: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("memories.id", ondelete="SET NULL"), nullable=True),
    )

    __table_args__ = (
        Index("ix_memories_user_id", "user_id"),
        Index("ix_memories_companion_id", "companion_id"),
        Index("ix_memories_conversation_id", "conversation_id"),
        Index("ix_memories_memory_type", "memory_type"),
        Index("ix_memories_consent_status", "consent_status"),
        Index("ix_memories_is_sensitive", "is_sensitive"),
        Index("ix_memories_deleted_at", "deleted_at", postgresql_where=sa.text("deleted_at IS NOT NULL")),
    )


class Avatar(SQLModel, table=True):
    __tablename__ = "avatars"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    user_id: UUID = Field(
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str = Field(max_length=100)
    config_version: int = Field(default=1)
    config: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
    preview_url: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )

    __table_args__ = (
        Index("ix_avatars_user_id", "user_id"),
    )


class AvatarAsset(SQLModel, table=True):
    __tablename__ = "avatar_assets"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    layer_type: str = Field(max_length=50)
    variant: str = Field(max_length=100)
    asset_url: str = Field(max_length=500)
    metadata: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )

    __table_args__ = (
        Index("ix_avatar_assets_layer_variant", "layer_type", "variant", unique=True),
    )


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: UUID = Field(
        default_factory=uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True, nullable=False),
    )
    user_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    action: str = Field(max_length=100)
    resource_type: str = Field(max_length=50)
    resource_id: Optional[UUID] = Field(default=None)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = Field(default=None, max_length=500)
    metadata: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(nullable=False),
    )

    __table_args__ = (
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_created_at", "created_at"),
    )