from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    companion_id: UUID
    conversation_id: Optional[UUID] = None
    content: str
    memory_type: str = Field(pattern="^(preference|fact|event|relationship|goal|correction)$")
    category: Optional[str] = Field(default=None, max_length=100)
    source: str = Field(pattern="^(user_explicit|user_correction|model_inference|conversation_summary)$")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    is_sensitive: bool = False


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    memory_type: Optional[str] = Field(default=None, pattern="^(preference|fact|event|relationship|goal|correction)$")
    category: Optional[str] = Field(default=None, max_length=100)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    is_sensitive: Optional[bool] = None
    consent_status: Optional[str] = Field(
        default=None,
        pattern="^(pending|approved|denied|auto_approved)$",
        description="Deprecated: consent status cannot be modified via generic update. Use POST /memories/{id}/consent.",
    )


class MemoryResponse(BaseModel):
    id: UUID
    user_id: UUID
    companion_id: UUID
    conversation_id: Optional[UUID]
    content: str
    memory_type: str
    category: Optional[str]
    source: str
    confidence: float
    is_sensitive: bool
    consent_status: str
    consent_requested_at: Optional[datetime]
    consent_granted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]
    superseded_by: Optional[UUID]

    class Config:
        from_attributes = True


class MemoryListResponse(BaseModel):
    memories: list["MemoryResponse"]
    total: int
    page: int
    page_size: int


class ConsentRequest(BaseModel):
    memory_id: UUID
    action: str = Field(pattern="^(approve|deny)$")


class ConsentResponse(BaseModel):
    memory_id: UUID
    consent_status: str
    message: str