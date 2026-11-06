from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user
from app.models import User
from app.schemas.companion import (
    CompanionCreate,
    CompanionUpdate,
    CompanionResponse,
    CompanionListResponse,
)
from app.services.companion import CompanionService, get_companion_service

router = APIRouter(tags=["companions"])


@router.post("", response_model=CompanionResponse, status_code=status.HTTP_201_CREATED)
async def create_companion(
    data: CompanionCreate,
    current_user: User = Depends(get_current_user),
    service: CompanionService = Depends(get_companion_service),
):
    """Create a new AI companion for the authenticated user."""
    try:
        companion = await service.create_companion(current_user.id, data)
        return companion
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=CompanionListResponse)
async def list_companions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    active_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    service: CompanionService = Depends(get_companion_service),
):
    """List companions belonging to the current user."""
    companions, total = await service.list_companions(
        current_user.id, page=page, page_size=page_size, active_only=active_only
    )
    return CompanionListResponse(
        companions=companions,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{companion_id}", response_model=CompanionResponse)
async def get_companion(
    companion_id: UUID,
    current_user: User = Depends(get_current_user),
    service: CompanionService = Depends(get_companion_service),
):
    """Get a companion by ID, ensuring ownership."""
    companion = await service.get_companion(current_user.id, companion_id)
    if not companion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Companion not found")
    return companion


@router.patch("/{companion_id}", response_model=CompanionResponse)
async def update_companion(
    companion_id: UUID,
    data: CompanionUpdate,
    current_user: User = Depends(get_current_user),
    service: CompanionService = Depends(get_companion_service),
):
    """Update a companion by ID, ensuring ownership."""
    companion = await service.update_companion(current_user.id, companion_id, data)
    if not companion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Companion not found")
    return companion


@router.delete("/{companion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_companion(
    companion_id: UUID,
    current_user: User = Depends(get_current_user),
    service: CompanionService = Depends(get_companion_service),
):
    """Delete a companion by ID, ensuring ownership."""
    success = await service.delete_companion(current_user.id, companion_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Companion not found")
