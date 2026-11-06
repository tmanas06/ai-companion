"""Schemas for local SadTalker talking-head video generation service."""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

SadTalkerJobStatus = Literal["queued", "processing", "completed", "failed", "cancelled"]


class SadTalkerJobCreateRequest(BaseModel):
    """Payload to request an AI lip-sync video generation job."""

    portrait_id: str = Field(
        default="aria",
        description="Approved local portrait asset identifier (e.g. 'aria', 'marcus')",
    )
    audio_base64: Optional[str] = Field(
        default=None,
        description="Base64-encoded WAV or MP3 speech audio",
    )
    audio_reference: Optional[str] = Field(
        default=None,
        description="Internal relative audio reference path (no remote URLs or path traversal)",
    )
    emotion: Optional[str] = Field(
        default="neutral",
        description="Conversational emotion hint for expression scale tuning",
    )
    expression_scale: Optional[float] = Field(
        default=1.0,
        ge=0.2,
        le=2.0,
        description="Restrained facial expression intensity",
    )
    pose_style: Optional[int] = Field(
        default=0,
        ge=0,
        le=45,
        description="Head pose style index",
    )
    size: Optional[int] = Field(
        default=256,
        description="Square video output resolution (256 or 512)",
    )
    still: Optional[bool] = Field(
        default=True,
        description="Enable still mode to stabilize head position and prevent distortion",
    )


class SadTalkerJobResponse(BaseModel):
    """Status and metadata of an individual SadTalker generation job."""

    job_id: str
    id: Optional[str] = None
    status: SadTalkerJobStatus
    portrait_id: str
    emotion: str
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    video_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    generation_time_seconds: Optional[float] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class SadTalkerServiceStatus(BaseModel):
    """Runtime health and availability status of the local SadTalker service."""

    enabled: bool
    available: bool
    device: str
    python_path: str
    checkpoints_dir: str
    checkpoints_found: bool
    max_concurrent_jobs: int
    queue_size: int
    active_jobs: int
    message: Optional[str] = None
