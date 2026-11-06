from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


class CompanionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    system_prompt: Optional[str] = Field(default=None, max_length=5000)
    personality: Optional[dict] = Field(default_factory=dict)
    llm_config: Optional[dict] = Field(default_factory=dict)
    is_active: bool = True


class CompanionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    system_prompt: Optional[str] = Field(default=None, max_length=5000)
    personality: Optional[dict] = None
    llm_config: Optional[dict] = None
    is_active: Optional[bool] = None


class CompanionResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    system_prompt: str
    personality: dict
    llm_config: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CompanionListResponse(BaseModel):
    companions: List[CompanionResponse]
    total: int
    page: int
    page_size: int
