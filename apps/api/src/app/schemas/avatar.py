from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


class AvatarLayerConfig(BaseModel):
    type: str = Field(pattern="^(skin|eyes|hair|clothing|accessory|background)$")
    variant: str
    color: Optional[str] = None
    z_index: int = 0
    visible: bool = True


class AvatarConfig(BaseModel):
    version: int = 1
    layers: List[AvatarLayerConfig]


class AvatarCreate(BaseModel):
    name: str = Field(max_length=100)
    config: AvatarConfig


class AvatarUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    config: Optional[AvatarConfig] = None
    is_active: Optional[bool] = None


class AvatarResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    config_version: int
    config: AvatarConfig
    preview_url: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AvatarListResponse(BaseModel):
    avatars: List["AvatarResponse"]
    total: int
    page: int
    page_size: int


class AvatarAssetCreate(BaseModel):
    layer_type: str
    variant: str
    asset_url: str
    metadata: Optional[dict] = None


class AvatarAssetResponse(BaseModel):
    id: UUID
    layer_type: str
    variant: str
    asset_url: str
    metadata: dict
    created_at: datetime

    class Config:
        from_attributes = True