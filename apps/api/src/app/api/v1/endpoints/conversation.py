import asyncio
import json
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationListResponse,
    MessageCreate,
    MessageResponse,
    MessageListResponse,
    ChatRequest,
    ChatResponse,
)
from app.services.conversation import ConversationService, get_conversation_service
from app.models import User


router = APIRouter(tags=["conversations"])


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Create a new conversation."""
    try:
        conversation = await service.create_conversation(current_user.id, data)
        return conversation
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """List conversations for the current user."""
    conversations, total = await service.list_conversations(
        current_user.id, page, page_size
    )
    return ConversationListResponse(
        conversations=conversations,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Get a conversation by ID."""
    conversation = await service.get_conversation(current_user.id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: UUID,
    data: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Update a conversation."""
    conversation = await service.update_conversation(current_user.id, conversation_id, data)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Delete a conversation (soft delete)."""
    success = await service.delete_conversation(current_user.id, conversation_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")


@router.get("/{conversation_id}/messages", response_model=MessageListResponse)
async def list_messages(
    conversation_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """List messages in a conversation."""
    # Verify conversation ownership
    conversation = await service.get_conversation(current_user.id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages, total = await service.get_messages(conversation_id, page, page_size)
    return MessageListResponse(
        messages=messages,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def add_message(
    conversation_id: UUID,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Add a message to a conversation."""
    conversation = await service.get_conversation(current_user.id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    message = await service.add_message(conversation_id, data)
    return message


def format_sse(event: str, data: dict) -> str:
    """Format Server-Sent Event string."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat")
async def chat(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Send a message and get AI response (streaming SSE or non-streaming JSON)."""
    if request.stream or "text/event-stream" in (http_request.headers.get("accept") or ""):
        # Validate conversation ownership and companion active status upfront
        try:
            await service.authorize_chat(current_user.id, request)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        async def event_generator():
            try:
                async for event in service.chat_stream(
                    current_user.id, request, background_tasks=background_tasks
                ):
                    if await http_request.is_disconnected():
                        break
                    yield format_sse(event["event"], event["data"])
            except asyncio.CancelledError:
                pass

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        conversation, user_message, assistant_message = await service.chat(
            current_user.id, request, background_tasks=background_tasks
        )
        return ChatResponse(
            conversation_id=conversation.id,
            message_id=assistant_message.id,
            content=assistant_message.content,
            model=assistant_message.model or "unknown",
            token_count=assistant_message.token_count,
            finish_reason=assistant_message.metadata.get("finish_reason") if assistant_message.metadata else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/chat/stream")
async def chat_stream_endpoint(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
):
    """Dedicated streaming chat endpoint returning Server-Sent Events."""
    request.stream = True
    return await chat(request, background_tasks, http_request, current_user, service)