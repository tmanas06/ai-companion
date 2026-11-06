"""API endpoints for local SadTalker talking-head video generation service."""

import base64
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse

from app.core.exceptions import ProviderConfigurationError
from app.core.security import get_current_user
from app.models import User
from app.schemas.sadtalker import (
    SadTalkerJobCreateRequest,
    SadTalkerJobResponse,
    SadTalkerServiceStatus,
)
from app.services.sadtalker import SadTalkerService, get_sadtalker_service

router = APIRouter(prefix="/sadtalker", tags=["sadtalker"])


@router.get("/status", response_model=SadTalkerServiceStatus)
async def get_service_status(
    current_user: User = Depends(get_current_user),
    service: SadTalkerService = Depends(get_sadtalker_service),
) -> SadTalkerServiceStatus:
    """Inspect local SadTalker hardware availability, checkpoint status, and queue metrics."""
    return service.get_service_status()


@router.post("/jobs", response_model=SadTalkerJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_job(
    portrait_id: str = Form("aria"),
    emotion: Optional[str] = Form("neutral"),
    expression_scale: Optional[float] = Form(1.0),
    pose_style: Optional[int] = Form(0),
    size: Optional[int] = Form(256),
    still: Optional[bool] = Form(True),
    audio_base64: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    service: SadTalkerService = Depends(get_sadtalker_service),
) -> SadTalkerJobResponse:
    """Submit a speech-driven talking head video generation job.

    Accepts raw audio via multipart upload or base64.
    Rejects unauthorized paths, external URLs, and over-length audio.
    """
    audio_bytes: Optional[bytes] = None

    if audio_file is not None:
        audio_bytes = await audio_file.read()
    elif audio_base64:
        try:
            # Strip data URI header if present
            clean_b64 = audio_base64
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
            audio_bytes = base64.b64decode(clean_b64)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 audio data: {e}",
            )

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No speech audio provided. Provide audio_file or audio_base64.",
        )

    try:
        return await service.submit_job(
            audio_bytes=audio_bytes,
            portrait_id=portrait_id,
            emotion=emotion,
            expression_scale=expression_scale,
            pose_style=pose_style,
            size=size or 256,
            still=still if still is not None else True,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ProviderConfigurationError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SadTalker job submission failed: {e}",
        )


@router.get("/jobs/{job_id}", response_model=SadTalkerJobResponse)
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    service: SadTalkerService = Depends(get_sadtalker_service),
) -> SadTalkerJobResponse:
    """Retrieve execution status and progress of a SadTalker generation job."""
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )
    return job


@router.get("/jobs/{job_id}/video")
async def get_job_video(
    job_id: str,
    current_user: User = Depends(get_current_user),
    service: SadTalkerService = Depends(get_sadtalker_service),
) -> FileResponse:
    """Stream generated MP4 talking-head video for playback."""
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")

    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job is currently {job.status}; video is not available yet",
        )

    video_path = service.get_job_video_path(job_id)
    if not video_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Generated video file not found or expired",
        )

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"sadtalker_{job_id}.mp4",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.delete("/jobs/{job_id}", response_model=SadTalkerJobResponse)
async def cancel_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    service: SadTalkerService = Depends(get_sadtalker_service),
) -> SadTalkerJobResponse:
    """Cancel an active generation job and terminate its subprocess."""
    cancelled = service.cancel_job(job_id)
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found")
    return job
