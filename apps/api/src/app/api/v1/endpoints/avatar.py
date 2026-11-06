from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from datetime import datetime

from app.core.database import get_async_session
from app.core.security import get_current_user
from app.schemas.avatar import (
    AvatarCreate,
    AvatarUpdate,
    AvatarResponse,
    AvatarListResponse,
    AvatarAssetCreate,
    AvatarAssetResponse,
)
from app.services.avatar import AvatarService, get_avatar_service
from app.models import User


router = APIRouter(prefix="/avatars", tags=["avatars"])


@router.post("", response_model=AvatarResponse, status_code=status.HTTP_201_CREATED)
async def create_avatar(
    data: AvatarCreate,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Create a new avatar configuration."""
    try:
        avatar = await service.create_avatar(current_user.id, data)
        return avatar
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=AvatarListResponse)
async def list_avatars(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """List avatars for the current user."""
    avatars, total = await service.list_avatars(current_user.id, page, page_size)
    return AvatarListResponse(
        avatars=avatars,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/active", response_model=AvatarResponse)
async def get_active_avatar(
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Get the user's active avatar."""
    avatar = await service.get_active_avatar(current_user.id)
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active avatar found")
    return avatar


@router.get("/{avatar_id}", response_model=AvatarResponse)
async def get_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Get an avatar by ID."""
    avatar = await service.get_avatar(current_user.id, avatar_id)
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    return avatar


@router.patch("/{avatar_id}", response_model=AvatarResponse)
async def update_avatar(
    avatar_id: UUID,
    data: AvatarUpdate,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Update an avatar."""
    avatar = await service.update_avatar(current_user.id, avatar_id, data)
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    return avatar


@router.delete("/{avatar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Delete an avatar."""
    success = await service.delete_avatar(current_user.id, avatar_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")


@router.post("/{avatar_id}/activate", response_model=AvatarResponse)
async def activate_avatar(
    avatar_id: UUID,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Set an avatar as the active one."""
    avatar = await service.set_active_avatar(current_user.id, avatar_id)
    if not avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    return avatar


# Avatar Assets
@router.post("/assets", response_model=AvatarAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_avatar_asset(
    data: AvatarAssetCreate,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Create a new avatar asset (admin only)."""
    try:
        asset = await service.create_asset(data)
        return asset
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/assets", response_model=dict)
async def list_avatar_assets(
    layer_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """List avatar assets."""
    assets, total = await service.list_assets(layer_type, page, page_size)
    return {"assets": assets, "total": total, "page": page, "page_size": page_size}


@router.get("/assets/{asset_id}", response_model=AvatarAssetResponse)
async def get_avatar_asset(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    service: AvatarService = Depends(get_avatar_service),
):
    """Get an avatar asset by ID."""
    asset = await service.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return asset