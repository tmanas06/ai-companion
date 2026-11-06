from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.security import get_current_user
from app.schemas.memory import (
    MemoryCreate,
    MemoryUpdate,
    MemoryResponse,
    MemoryListResponse,
    ConsentRequest,
    ConsentResponse,
)
from app.services.memory import MemoryService, get_memory_service
from app.models import User, Companion

router = APIRouter(tags=["memories"])


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    data: MemoryCreate,
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Create a new memory."""
    try:
        memory = await service.create_memory(current_user.id, data)
        return memory
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=MemoryListResponse)
async def list_memories(
    companion_id: Optional[UUID] = None,
    memory_type: Optional[str] = None,
    consent_status: Optional[str] = None,
    include_sensitive: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """List memories for the current user."""
    memories, total = await service.list_memories(
        user_id=current_user.id,
        companion_id=companion_id,
        memory_type=memory_type,
        consent_status=consent_status,
        include_sensitive=include_sensitive,
        page=page,
        page_size=page_size,
    )
    return MemoryListResponse(
        memories=memories,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/pending-consent", response_model=MemoryListResponse)
async def list_pending_consent(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """List memories pending user consent."""
    memories, total = await service.get_pending_consent_memories(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )
    return MemoryListResponse(
        memories=memories,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/search", response_model=MemoryListResponse)
async def search_memories(
    q: str = Query(..., min_length=1, max_length=500),
    companion_id: Optional[UUID] = None,
    include_sensitive: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Search memories by content."""
    memories, total = await service.search_memories(
        user_id=current_user.id,
        query=q,
        companion_id=companion_id,
        include_sensitive=include_sensitive,
        page=page,
        page_size=page_size,
    )
    return MemoryListResponse(
        memories=memories,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/vector-search", response_model=list[MemoryResponse])
async def search_similar_memories(
    q: str = Query(..., min_length=1, max_length=500),
    companion_id: UUID = Query(...),
    limit: int = Query(5, ge=1, le=50),
    threshold: Optional[float] = Query(None, ge=0.0, le=2.0),
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Semantic vector search for memories belonging to the user and active companion."""
    from app.providers.embedding import get_embedding_provider
    from app.core.config import settings

    # Verify companion exists and belongs to current_user upfront
    companion = await service.session.get(Companion, companion_id)
    if not companion or companion.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Companion not found",
        )

    provider = get_embedding_provider()
    query_vector = await provider.embed(q)
    cutoff = threshold if threshold is not None else settings.RAG_SIMILARITY_THRESHOLD
    memories = await service.search_similar_memories(
        user_id=current_user.id,
        companion_id=companion_id,
        query_vector=query_vector,
        limit=limit,
        threshold=cutoff,
    )
    return memories


@router.get("/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: UUID,
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Get a memory by ID."""
    memory = await service.get_memory(current_user.id, memory_id)
    if not memory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    return memory


@router.patch("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: UUID,
    data: MemoryUpdate,
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Update a memory."""
    try:
        memory = await service.update_memory(current_user.id, memory_id, data)
        if not memory:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
        return memory
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: UUID,
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Delete a memory (soft delete)."""
    success = await service.delete_memory(current_user.id, memory_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")


@router.post("/{memory_id}/supersede", response_model=MemoryResponse)
async def supersede_memory(
    memory_id: UUID,
    data: MemoryCreate,
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Create a new memory that supersedes an existing one."""
    try:
        memory = await service.supersede_memory(current_user.id, memory_id, data)
        return memory
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{memory_id}/consent", response_model=ConsentResponse)
async def handle_consent(
    memory_id: UUID,
    request: ConsentRequest,
    current_user: User = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
):
    """Approve or deny consent for a sensitive memory."""
    try:
        memory = await service.handle_consent(current_user.id, request)
        return ConsentResponse(
            memory_id=memory.id,
            consent_status=memory.consent_status,
            message=f"Memory consent {memory.consent_status}",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))