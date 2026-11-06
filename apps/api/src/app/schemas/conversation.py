from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    companion_id: UUID
    title: Optional[str] = Field(default=None, max_length=500)


class ConversationUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=500)
    is_archived: Optional[bool] = None


class ConversationResponse(BaseModel):
    id: UUID
    user_id: UUID
    companion_id: UUID
    title: Optional[str]
    summary: Optional[str]
    message_count: int
    last_message_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int
    page: int
    page_size: int


class MessageCreate(BaseModel):
    role: str = Field(pattern="^(user|assistant|system|tool)$")
    content: str
    token_count: Optional[int] = None
    model: Optional[str] = None
    tool_calls: Optional[dict] = None
    tool_call_id: Optional[str] = None
    metadata: Optional[dict] = None


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    token_count: Optional[int]
    model: Optional[str]
    tool_calls: Optional[dict]
    tool_call_id: Optional[str]
    metadata: dict
    created_at: datetime

    class Config:
        from_attributes = True


class MessageListResponse(BaseModel):
    messages: list[MessageResponse]
    total: int
    page: int
    page_size: int


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[UUID] = None
    companion_id: Optional[UUID] = None
    stream: bool = False
    voice_mode: bool = False


class ChatResponse(BaseModel):
    conversation_id: UUID
    message_id: UUID
    content: str
    model: str
    token_count: Optional[int]
    finish_reason: Optional[str]