from datetime import UTC, datetime
from typing import Annotated, Optional
from uuid import UUID
from fastapi import Depends
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Conversation, Message, Companion, User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    MessageCreate,
    ChatRequest,
)
from app.providers import get_provider, CompletionRequest
from app.core.database import get_async_session


class ConversationService:
    """Service for managing conversations and messages."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_conversation(
        self, user_id: UUID, data: ConversationCreate
    ) -> "Conversation":
        """Create a new conversation."""
        # Verify companion exists and belongs to user
        companion = await self.session.get(Companion, data.companion_id)
        if not companion or companion.user_id != user_id:
            raise ValueError("Companion not found or access denied")

        conversation = Conversation(
            user_id=user_id,
            companion_id=data.companion_id,
            title=data.title,
        )
        self.session.add(conversation)
        await self.session.commit()
        await self.session.refresh(conversation)
        return conversation

    async def get_conversation(self, user_id: UUID, conversation_id: UUID) -> Optional["Conversation"]:
        """Get a conversation by ID, ensuring ownership."""
        result = await self.session.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .where(Conversation.user_id == user_id)
            .where(Conversation.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def list_conversations(
        self, user_id: UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list["Conversation"], int]:
        """List conversations for a user with pagination."""
        # Count total
        count_result = await self.session.execute(
            select(func.count(Conversation.id))
            .where(Conversation.user_id == user_id)
            .where(Conversation.deleted_at.is_(None))
        )
        total = count_result.scalar() or 0

        # Get paginated results
        result = await self.session.execute(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .where(Conversation.deleted_at.is_(None))
            .order_by(desc(Conversation.last_message_at).nullslast(), desc(Conversation.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        conversations = result.scalars().all()
        return list(conversations), total

    async def update_conversation(
        self, user_id: UUID, conversation_id: UUID, data: ConversationUpdate
    ) -> Optional["Conversation"]:
        """Update a conversation."""
        conversation = await self.get_conversation(user_id, conversation_id)
        if not conversation:
            return None

        if data.title is not None:
            conversation.title = data.title
        # is_archived not implemented yet - would need deleted_at or is_archived field

        conversation.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(conversation)
        return conversation

    async def delete_conversation(self, user_id: UUID, conversation_id: UUID) -> bool:
        """Soft delete a conversation."""
        conversation = await self.get_conversation(user_id, conversation_id)
        if not conversation:
            return False

        conversation.deleted_at = datetime.now(UTC)
        await self.session.commit()
        return True

    async def add_message(
        self, conversation_id: UUID, data: MessageCreate
    ) -> "Message":
        """Add a message to a conversation."""
        message = Message(
            conversation_id=conversation_id,
            role=data.role,
            content=data.content,
            token_count=data.token_count,
            model=data.model,
            tool_calls=data.tool_calls,
            tool_call_id=data.tool_call_id,
            metadata=data.metadata or {},
        )
        self.session.add(message)

        # Update conversation
        result = await self.session.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        if conversation:
            conversation.message_count += 1
            conversation.last_message_at = datetime.now(UTC)
            conversation.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(message)
        return message

    async def get_messages(
        self, conversation_id: UUID, page: int = 1, page_size: int = 50
    ) -> tuple[list["Message"], int]:
        """Get messages for a conversation with pagination."""
        # Count total
        count_result = await self.session.execute(
            select(func.count(Message.id)).where(Message.conversation_id == conversation_id)
        )
        total = count_result.scalar() or 0

        # Get paginated results (oldest first for chat display)
        result = await self.session.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        messages = result.scalars().all()
        return list(messages), total

    async def get_recent_messages(
        self, conversation_id: UUID, limit: int = 20
    ) -> list["Message"]:
        """Get recent messages for context building (most recent first)."""
        result = await self.session.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        messages = result.scalars().all()
        return list(reversed(list(messages)))  # Return oldest first for context

    async def chat(
        self,
        user_id: UUID,
        request: ChatRequest,
    ) -> tuple["Conversation", "Message", "Message"]:
        """
        Process a chat request: create/get conversation, add user message,
        generate AI response, add assistant message.
        """
        # Get or create conversation
        if request.conversation_id:
            conversation = await self.get_conversation(user_id, request.conversation_id)
            if not conversation:
                raise ValueError("Conversation not found")
            if request.companion_id and conversation.companion_id != request.companion_id:
                raise ValueError("Companion mismatch")
        else:
            if not request.companion_id:
                raise ValueError("companion_id required for new conversation")
            conversation = await self.create_conversation(
                user_id,
                ConversationCreate(companion_id=request.companion_id),
            )

        # Add user message
        user_message = await self.add_message(
            conversation.id,
            MessageCreate(
                role="user",
                content=request.message,
            ),
        )

        # Build context for AI
        recent_messages = await self.get_recent_messages(conversation.id, limit=20)
        messages = [{"role": m.role, "content": m.content} for m in recent_messages]

        # Get companion for system prompt and model config
        companion = await self.session.get(Companion, conversation.companion_id)
        if not companion:
            raise ValueError("Companion not found")

        # Get AI provider
        provider = get_provider()
        model = companion.llm_config.get("model") or provider.get_default_model()

        # Generate AI response
        completion_request = CompletionRequest(
            messages=messages,
            model=model,
            temperature=companion.llm_config.get("temperature", 0.7),
            max_tokens=companion.llm_config.get("max_tokens"),
            system_prompt=companion.system_prompt,
        )

        response = await provider.complete(completion_request)

        # Add assistant message
        assistant_message = await self.add_message(
            conversation.id,
            MessageCreate(
                role="assistant",
                content=response.content,
                token_count=response.usage.get("total_tokens") if response.usage else None,
                model=response.model,
                metadata={"finish_reason": response.finish_reason},
            ),
        )

        return conversation, user_message, assistant_message


async def get_conversation_service(
    session: Annotated[AsyncSession, Depends(get_async_session)]
) -> ConversationService:
    """Dependency for getting conversation service."""
    return ConversationService(session)