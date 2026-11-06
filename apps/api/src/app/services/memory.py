from datetime import UTC, datetime
from typing import Optional, Annotated, TYPE_CHECKING
from uuid import UUID
from fastapi import Depends
from sqlalchemy import select, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Memory, User, Companion, Conversation, Message
from app.schemas.memory import MemoryCreate, MemoryUpdate, ConsentRequest
from app.services.sensitivity import is_content_sensitive

if TYPE_CHECKING:
    from app.providers.embedding import BaseEmbeddingProvider


class MemoryService:
    """Service for managing memories with consent workflow and vector search."""

    def __init__(
        self,
        session: AsyncSession,
        embedding_provider: Optional["BaseEmbeddingProvider"] = None,
    ):
        self.session = session
        self._embedding_provider = embedding_provider

    def _get_embedding_provider(self) -> "BaseEmbeddingProvider":
        if self._embedding_provider is None:
            from app.providers.embedding import get_embedding_provider
            self._embedding_provider = get_embedding_provider()
        return self._embedding_provider

    async def _prepare_memory_record(
        self, user_id: UUID, data: MemoryCreate
    ) -> "Memory":
        """Validate, generate embedding (if eligible), and construct Memory instance."""
        # Verify companion exists and belongs to user
        companion = await self.session.get(Companion, data.companion_id)
        if not companion or companion.user_id != user_id:
            raise ValueError("Companion not found or access denied")

        # Verify conversation if provided
        if data.conversation_id:
            conversation = await self.session.get(Conversation, data.conversation_id)
            if not conversation or conversation.user_id != user_id:
                raise ValueError("Conversation not found or access denied")

        # Verify source_message_id if provided
        if data.source_message_id:
            msg = await self.session.get(Message, data.source_message_id)
            if not msg or (data.conversation_id and msg.conversation_id != data.conversation_id):
                raise ValueError("Source message not found or belongs to another conversation")

        # Determine effective sensitivity: logical OR of client-provided flag and deterministic classification
        content_is_sensitive = is_content_sensitive(data.content)
        effective_sensitive = bool(data.is_sensitive or content_is_sensitive)

        # Determine consent status
        consent_status = "pending" if effective_sensitive else "auto_approved"
        consent_requested_at = datetime.now(UTC) if effective_sensitive else None

        # Only generate embeddings for auto-approved memories; pending memories defer embedding
        embedding_vector: Optional[list[float]] = None
        if consent_status == "auto_approved":
            provider = self._get_embedding_provider()
            embedding_vector = await provider.embed(data.content)

        return Memory(
            user_id=user_id,
            companion_id=data.companion_id,
            conversation_id=data.conversation_id,
            source_message_id=data.source_message_id,
            content=data.content,
            memory_type=data.memory_type,
            category=data.category,
            source=data.source,
            confidence=data.confidence,
            is_sensitive=effective_sensitive,
            consent_status=consent_status,
            consent_requested_at=consent_requested_at,
            embedding=embedding_vector,
        )

    async def create_memory(
        self, user_id: UUID, data: MemoryCreate
    ) -> "Memory":
        """Create a new memory with automatic embedding for eligible records."""
        memory = await self._prepare_memory_record(user_id, data)
        self.session.add(memory)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(memory)
        return memory

    async def get_memory(self, user_id: UUID, memory_id: UUID) -> Optional["Memory"]:
        """Get a memory by ID, ensuring ownership."""
        result = await self.session.execute(
            select(Memory)
            .where(Memory.id == memory_id)
            .where(Memory.user_id == user_id)
            .where(Memory.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def list_memories(
        self,
        user_id: UUID,
        companion_id: Optional[UUID] = None,
        memory_type: Optional[str] = None,
        consent_status: Optional[str] = None,
        include_sensitive: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list["Memory"], int]:
        """List memories for a user with filtering and pagination."""
        query = (
            select(Memory)
            .where(Memory.user_id == user_id)
            .where(Memory.deleted_at.is_(None))
        )

        if companion_id:
            query = query.where(Memory.companion_id == companion_id)
        if memory_type:
            query = query.where(Memory.memory_type == memory_type)
        if consent_status:
            query = query.where(Memory.consent_status == consent_status)
        if not include_sensitive:
            query = query.where(Memory.is_sensitive.is_(False))

        # Count total
        count_query = select(func.count(Memory.id)).select_from(query.subquery())
        count_result = await self.session.execute(count_query)
        total = count_result.scalar() or 0

        # Get paginated results
        query = query.order_by(desc(Memory.created_at)).offset((page - 1) * page_size).limit(page_size)
        result = await self.session.execute(query)
        memories = result.scalars().all()
        return list(memories), total

    async def update_memory(
        self, user_id: UUID, memory_id: UUID, data: MemoryUpdate
    ) -> Optional["Memory"]:
        """Update a memory, enforcing deterministic sensitivity classification and consent invariants."""
        if data.consent_status is not None:
            raise ValueError(
                "Consent status cannot be modified via generic memory update; "
                "use the dedicated consent endpoint POST /api/v1/memories/{id}/consent."
            )

        memory = await self.get_memory(user_id, memory_id)
        if not memory:
            return None

        # Determine target content and whether it changed
        target_content = data.content.strip() if data.content is not None else memory.content
        if not target_content:
            raise ValueError("Memory content cannot be empty")
        content_changed = data.content is not None and target_content != memory.content

        # Deterministic sensitivity check on target content
        content_is_sensitive = is_content_sensitive(target_content)
        explicit_sensitive = data.is_sensitive is True or (data.is_sensitive is None and memory.is_sensitive)
        new_is_sensitive = content_is_sensitive or explicit_sensitive

        # Detect transition to sensitive state or requiring renewed consent
        became_sensitive = new_is_sensitive and (
            memory.consent_status in ("approved", "auto_approved")
            or not memory.is_sensitive
            or content_changed
        )

        if content_changed:
            memory.content = target_content

        if new_is_sensitive:
            memory.is_sensitive = True
            if became_sensitive:
                memory.consent_status = "pending"
                memory.consent_requested_at = datetime.now(UTC)
                memory.consent_granted_at = None
                # Clear existing embedding: sensitive pending memories must never have embeddings
                memory.embedding = None
        else:
            if data.is_sensitive is False:
                memory.is_sensitive = False
            # Non-sensitive content updates: only regenerate embedding if memory is currently approved
            if content_changed and memory.consent_status in ("approved", "auto_approved"):
                provider = self._get_embedding_provider()
                memory.embedding = await provider.embed(target_content)

        if data.memory_type is not None:
            memory.memory_type = data.memory_type
        if data.category is not None:
            memory.category = data.category
        if data.confidence is not None:
            memory.confidence = data.confidence

        memory.updated_at = datetime.now(UTC)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(memory)
        return memory

    async def delete_memory(self, user_id: UUID, memory_id: UUID) -> bool:
        """Soft delete a memory and clear its embedding."""
        memory = await self.get_memory(user_id, memory_id)
        if not memory:
            return False

        memory.deleted_at = datetime.now(UTC)
        memory.embedding = None
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return True

    async def supersede_memory(
        self, user_id: UUID, old_memory_id: UUID, new_data: MemoryCreate
    ) -> "Memory":
        """Create a new memory that supersedes an old one in a single atomic transaction."""
        old_memory = await self.get_memory(user_id, old_memory_id)
        if not old_memory:
            raise ValueError("Original memory not found")

        # Prepare new memory (validates companion/conversation and generates embedding if eligible)
        # Any validation or embedding failure occurs upfront before touching old_memory
        new_memory = await self._prepare_memory_record(old_memory.user_id, new_data)

        try:
            # Flush new_memory within the open transaction so its id exists for the foreign key
            self.session.add(new_memory)
            await self.session.flush()

            # Atomically link old memory to new one and clear old embedding
            old_memory.superseded_by = new_memory.id
            old_memory.deleted_at = datetime.now(UTC)
            old_memory.embedding = None
            self.session.add(old_memory)

            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        await self.session.refresh(new_memory)
        return new_memory

    async def handle_consent(
        self,
        user_id: UUID,
        request: ConsentRequest,
        path_memory_id: Optional[UUID] = None,
    ) -> "Memory":
        """Handle user consent for a sensitive memory with authoritative path ID validation."""
        target_memory_id = path_memory_id or request.memory_id
        if path_memory_id is not None and request.memory_id is not None and path_memory_id != request.memory_id:
            raise ValueError("Memory ID in path does not match memory ID in request body")

        memory = await self.get_memory(user_id, target_memory_id)
        if not memory:
            raise ValueError("Memory not found")

        if not memory.is_sensitive:
            raise ValueError("Memory is not sensitive, consent not required")

        if memory.consent_status != "pending":
            raise ValueError(f"Memory consent status is already {memory.consent_status}")

        if request.action == "approve":
            # Generate embedding before updating consent
            provider = self._get_embedding_provider()
            embedding_vector = await provider.embed(memory.content)

            memory.consent_status = "approved"
            memory.consent_granted_at = datetime.now(UTC)
            memory.embedding = embedding_vector
        elif request.action == "deny":
            memory.consent_status = "denied"
            memory.deleted_at = datetime.now(UTC)
            memory.embedding = None
        else:
            raise ValueError("Invalid action")

        memory.updated_at = datetime.now(UTC)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(memory)
        return memory

    async def get_pending_consent_memories(
        self, user_id: UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list["Memory"], int]:
        """Get memories pending user consent."""
        return await self.list_memories(
            user_id,
            consent_status="pending",
            include_sensitive=True,
            page=page,
            page_size=page_size,
        )

    async def search_memories(
        self,
        user_id: UUID,
        query: str,
        companion_id: Optional[UUID] = None,
        include_sensitive: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list["Memory"], int]:
        """Search memories by content (text substring search)."""
        stmt = (
            select(Memory)
            .where(Memory.user_id == user_id)
            .where(Memory.deleted_at.is_(None))
            .where(Memory.content.ilike(f"%{query}%"))
        )

        if companion_id:
            stmt = stmt.where(Memory.companion_id == companion_id)
        if not include_sensitive:
            stmt = stmt.where(Memory.is_sensitive.is_(False))

        # Count total
        count_query = select(func.count(Memory.id)).select_from(stmt.subquery())
        count_result = await self.session.execute(count_query)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = stmt.order_by(desc(Memory.created_at)).offset((page - 1) * page_size).limit(page_size)
        result = await self.session.execute(stmt)
        memories = result.scalars().all()
        return list(memories), total

    async def search_similar_memories(
        self,
        user_id: UUID,
        companion_id: UUID,
        query_vector: list[float],
        limit: int = 5,
        threshold: float = 0.5,
    ) -> list["Memory"]:
        """Search memories using vector cosine similarity.

        Applies strict database-level filtering:
        - Authenticated user_id
        - Active companion_id
        - deleted_at IS NULL
        - embedding IS NOT NULL
        - consent_status IN ('approved', 'auto_approved')
        - Cosine distance <= threshold

        Results are ordered by cosine distance ascending.
        """
        provider = self._get_embedding_provider()
        if len(query_vector) != provider.dimension:
            raise ValueError(
                f"Query vector dimension mismatch: expected {provider.dimension}, got {len(query_vector)}"
            )

        distance_expr = Memory.embedding.cosine_distance(query_vector)
        stmt = (
            select(Memory)
            .where(Memory.user_id == user_id)
            .where(Memory.companion_id == companion_id)
            .where(Memory.deleted_at.is_(None))
            .where(Memory.embedding.is_not(None))
            .where(Memory.consent_status.in_(["approved", "auto_approved"]))
            .where(distance_expr <= threshold)
            .order_by(distance_expr.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


async def get_memory_service(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> "MemoryService":
    """Dependency for getting memory service."""
    return MemoryService(session)