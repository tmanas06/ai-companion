from datetime import UTC, datetime
from typing import Optional
from uuid import UUID
from sqlalchemy import select, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Memory, User, Companion, Conversation
from app.schemas.memory import MemoryCreate, MemoryUpdate, ConsentRequest


class MemoryService:
    """Service for managing memories with consent workflow."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_memory(
        self, user_id: UUID, data: MemoryCreate
    ) -> "Memory":
        """Create a new memory."""
        # Verify companion exists and belongs to user
        companion = await self.session.get(Companion, data.companion_id)
        if not companion or companion.user_id != user_id:
            raise ValueError("Companion not found or access denied")

        # Verify conversation if provided
        if data.conversation_id:
            conversation = await self.session.get(Conversation, data.conversation_id)
            if not conversation or conversation.user_id != user_id:
                raise ValueError("Conversation not found or access denied")

        # Determine consent status
        consent_status = "auto_approved" if not data.is_sensitive else "pending"
        consent_requested_at = datetime.now(UTC) if data.is_sensitive else None

        memory = Memory(
            user_id=user_id,
            companion_id=data.companion_id,
            conversation_id=data.conversation_id,
            content=data.content,
            memory_type=data.memory_type,
            category=data.category,
            source=data.source,
            confidence=data.confidence,
            is_sensitive=data.is_sensitive,
            consent_status=consent_status,
            consent_requested_at=consent_requested_at,
        )
        self.session.add(memory)
        await self.session.commit()
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
        """Update a memory."""
        memory = await self.get_memory(user_id, memory_id)
        if not memory:
            return None

        if data.content is not None:
            memory.content = data.content
        if data.memory_type is not None:
            memory.memory_type = data.memory_type
        if data.category is not None:
            memory.category = data.category
        if data.confidence is not None:
            memory.confidence = data.confidence
        if data.is_sensitive is not None:
            memory.is_sensitive = data.is_sensitive
        if data.consent_status is not None:
            memory.consent_status = data.consent_status
            if data.consent_status == "approved" and memory.consent_granted_at is None:
                memory.consent_granted_at = datetime.now(UTC)

        memory.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(memory)
        return memory

    async def delete_memory(self, user_id: UUID, memory_id: UUID) -> bool:
        """Soft delete a memory."""
        memory = await self.get_memory(user_id, memory_id)
        if not memory:
            return False

        memory.deleted_at = datetime.now(UTC)
        # Also delete embedding if exists
        memory.embedding = None
        await self.session.commit()
        return True

    async def supersede_memory(
        self, user_id: UUID, old_memory_id: UUID, new_data: MemoryCreate
    ) -> "Memory":
        """Create a new memory that supersedes an old one."""
        old_memory = await self.get_memory(user_id, old_memory_id)
        if not old_memory:
            raise ValueError("Original memory not found")

        # Create new memory
        new_memory = await self.create_memory(old_memory.user_id, new_data)

        # Link old memory to new one
        old_memory.superseded_by = new_memory.id
        old_memory.deleted_at = datetime.now(UTC)
        await self.session.commit()

        return new_memory

    async def handle_consent(self, user_id: UUID, request: ConsentRequest) -> "Memory":
        """Handle user consent for a sensitive memory."""
        memory = await self.get_memory(user_id, request.memory_id)
        if not memory:
            raise ValueError("Memory not found")

        if not memory.is_sensitive:
            raise ValueError("Memory is not sensitive, consent not required")

        if memory.consent_status != "pending":
            raise ValueError(f"Memory consent status is already {memory.consent_status}")

        if request.action == "approve":
            memory.consent_status = "approved"
            memory.consent_granted_at = datetime.now(UTC)
        elif request.action == "deny":
            memory.consent_status = "denied"
            memory.deleted_at = datetime.now(UTC)  # Denied sensitive memories are deleted
        else:
            raise ValueError("Invalid action")

        memory.updated_at = datetime.now(UTC)
        await self.session.commit()
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
        """Search memories by content (text search)."""
        query = (
            select(Memory)
            .where(Memory.user_id == user_id)
            .where(Memory.deleted_at.is_(None))
            .where(Memory.content.ilike(f"%{query}%"))
        )

        if companion_id:
            query = query.where(Memory.companion_id == companion_id)
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


async def get_memory_service(session) -> "MemoryService":
    """Dependency for getting memory service."""
    return MemoryService(session)