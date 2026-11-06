"""SadTalker local talking-head video generation service.

Orchestrates isolated local SadTalker execution as a controlled background subprocess.
Provides job tracking, deduplication, path traversal validation, timeout enforcement,
and temporary artifact retention management without cloud dependency or telemetry.
"""

import asyncio
import base64
import hashlib
import os
import shutil
import signal
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple
from uuid import uuid4

import structlog

from app.core.config import settings
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.schemas.sadtalker import (
    SadTalkerJobResponse,
    SadTalkerJobStatus,
    SadTalkerServiceStatus,
)

logger = structlog.get_logger(__name__)

# Canonical approved portrait assets mapping
APPROVED_PORTRAITS: Dict[str, str] = {
    "aria": "apps/web/public/avatars/aria-portrait.jpg",
    "marcus": "apps/web/public/avatars/marcus-portrait.jpg",
    "elena": "apps/web/public/avatars/elena-portrait.jpg",
    "liam": "apps/web/public/avatars/liam-portrait.jpg",
}

# Emotion to SadTalker expression and pose tuning
EMOTION_TUNING: Dict[str, Dict[str, float]] = {
    "neutral": {"expression_scale": 1.0, "pose_style": 0},
    "happy": {"expression_scale": 1.15, "pose_style": 0},
    "empathetic": {"expression_scale": 0.9, "pose_style": 0},
    "reassuring": {"expression_scale": 0.9, "pose_style": 0},
    "surprised": {"expression_scale": 1.2, "pose_style": 0},
    "curious": {"expression_scale": 1.05, "pose_style": 0},
    "sad": {"expression_scale": 0.85, "pose_style": 0},
    "laughing": {"expression_scale": 1.25, "pose_style": 0},
    "confused": {"expression_scale": 0.95, "pose_style": 0},
}


class JobRecord:
    """Internal job state tracking."""

    def __init__(
        self,
        job_id: str,
        portrait_id: str,
        emotion: str,
        audio_hash: str,
        video_path: Optional[str] = None,
    ):
        self.job_id = job_id
        self.portrait_id = portrait_id
        self.emotion = emotion
        self.audio_hash = audio_hash
        self.status: SadTalkerJobStatus = "queued"
        self.progress: float = 0.0
        self.video_path: Optional[str] = video_path
        self.duration_seconds: Optional[float] = None
        self.generation_time_seconds: Optional[float] = None
        self.error: Optional[str] = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.completed_at: Optional[str] = None
        self.process: Optional[asyncio.subprocess.Process] = None


class SadTalkerService:
    """Singleton service managing local SadTalker talking-head video generation."""

    _instance: Optional["SadTalkerService"] = None

    def __init__(self) -> None:
        self.workspace_root = Path(os.getcwd()).resolve()
        # Handle cases where cwd is apps/api
        if self.workspace_root.name == "api" and self.workspace_root.parent.name == "apps":
            self.workspace_root = self.workspace_root.parent.parent

        self.jobs: Dict[str, JobRecord] = {}
        self.dedup_cache: Dict[str, str] = {}  # input_hash -> job_id
        self._semaphore = asyncio.Semaphore(settings.SADTALKER_MAX_CONCURRENT_JOBS)
        self._ensure_output_dir()

    @classmethod
    def get_instance(cls) -> "SadTalkerService":
        if cls._instance is None:
            cls._instance = SadTalkerService()
        return cls._instance

    def _ensure_output_dir(self) -> Path:
        out_dir = self.workspace_root / settings.SADTALKER_OUTPUT_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        return out_dir

    def resolve_portrait_path(self, portrait_id: str) -> Path:
        """Validate and resolve portrait identifier against approved local whitelist."""
        if not portrait_id:
            portrait_id = "aria"

        clean_id = portrait_id.strip().lower()
        if clean_id not in APPROVED_PORTRAITS:
            raise ValueError(
                f"Portrait ID '{portrait_id}' is not in approved whitelist: {list(APPROVED_PORTRAITS.keys())}"
            )

        portrait_rel = APPROVED_PORTRAITS[clean_id]
        full_path = (self.workspace_root / portrait_rel).resolve()

        # Strict path traversal check
        if not str(full_path).startswith(str(self.workspace_root)):
            raise ValueError("Path traversal attempt detected in portrait path resolution")

        if not full_path.exists():
            raise FileNotFoundError(f"Approved portrait asset not found on disk: {portrait_rel}")

        return full_path

    def get_service_status(self) -> SadTalkerServiceStatus:
        """Inspect runtime availability of Python binary, checkpoints, and dependencies."""
        py_path = (self.workspace_root / settings.SADTALKER_PYTHON_PATH).resolve()
        ckpt_dir = (self.workspace_root / settings.SADTALKER_CHECKPOINTS_DIR).resolve()
        base_dir = (self.workspace_root / settings.SADTALKER_BASE_PATH).resolve()

        python_exists = py_path.is_file() and os.access(py_path, os.X_OK)
        checkpoints_found = (
            ckpt_dir.is_dir()
            and (ckpt_dir / "SadTalker_V0.0.2_256.safetensors").exists()
            and (ckpt_dir / "mapping_00229-model.pth.tar").exists()
        )
        base_exists = base_dir.is_dir() and (base_dir / "inference.py").exists()

        available = bool(settings.SADTALKER_ENABLED and python_exists and checkpoints_found and base_exists)

        active_count = sum(1 for j in self.jobs.values() if j.status in ("queued", "processing"))

        message = None
        if not settings.SADTALKER_ENABLED:
            message = "SadTalker service is currently disabled in backend settings (SADTALKER_ENABLED=False)."
        elif not python_exists:
            message = f"SadTalker isolated virtual environment Python not found at {py_path}."
        elif not checkpoints_found:
            message = f"SadTalker model checkpoints missing in {ckpt_dir}."

        return SadTalkerServiceStatus(
            enabled=settings.SADTALKER_ENABLED,
            available=available,
            device=settings.SADTALKER_DEVICE,
            python_path=str(py_path),
            checkpoints_dir=str(ckpt_dir),
            checkpoints_found=checkpoints_found,
            max_concurrent_jobs=settings.SADTALKER_MAX_CONCURRENT_JOBS,
            queue_size=len(self.jobs),
            active_jobs=active_count,
            message=message,
        )

    def validate_audio_duration(self, audio_bytes: bytes) -> float:
        """Inspect audio duration and validate maximum length to protect system resources."""
        if not audio_bytes or len(audio_bytes) < 44:
            raise ValueError("Audio payload is empty or too short")

        # Check maximum file size (5MB safety limit for voice turns)
        if len(audio_bytes) > 5 * 1024 * 1024:
            raise ValueError("Audio size exceeds maximum limit of 5MB")

        duration = 0.0
        # If WAV audio, parse duration from header
        if audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
            try:
                import wave
                import io
                with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate()
                    duration = frames / float(rate)
            except Exception as e:
                logger.warning("Failed to parse WAV duration from header: %s", e)

        # Fallback estimation based on average byte rate if not parsed
        if duration <= 0:
            duration = max(1.0, len(audio_bytes) / 32000.0)

        if duration > settings.SADTALKER_MAX_AUDIO_SECONDS:
            raise ValueError(
                f"Audio duration ({duration:.1f}s) exceeds maximum permitted limit ({settings.SADTALKER_MAX_AUDIO_SECONDS}s)"
            )

        return duration

    def cleanup_expired_files(self) -> int:
        """Remove generated video artifacts older than retention duration."""
        out_dir = self._ensure_output_dir()
        retention_sec = settings.SADTALKER_FILE_RETENTION_HOURS * 3600
        now = time.time()
        removed_count = 0

        for file in out_dir.glob("*.mp4"):
            try:
                if now - file.stat().st_mtime > retention_sec:
                    file.unlink(missing_ok=True)
                    removed_count += 1
            except Exception as e:
                logger.warning("Error deleting expired file %s: %s", file, e)

        return removed_count

    async def submit_job(
        self,
        audio_bytes: bytes,
        portrait_id: str = "aria",
        emotion: Optional[str] = "neutral",
        expression_scale: Optional[float] = None,
        pose_style: Optional[int] = None,
        size: int = 256,
        still: bool = True,
    ) -> SadTalkerJobResponse:
        """Submit a talking-head video generation job."""
        portrait_path = self.resolve_portrait_path(portrait_id)
        duration = self.validate_audio_duration(audio_bytes)

        if not settings.SADTALKER_ENABLED:
            raise ProviderConfigurationError(
                "SadTalker service is disabled. Set SADTALKER_ENABLED=True to activate."
            )

        status_info = self.get_service_status()
        if not status_info.available:
            raise ProviderConfigurationError(
                status_info.message or "SadTalker service is currently unavailable."
            )

        # Deduplication hash: audio bytes + portrait + tuning
        clean_emotion = (emotion or "neutral").strip().lower()
        tuning = EMOTION_TUNING.get(clean_emotion, EMOTION_TUNING["neutral"])
        exp_scale = expression_scale if expression_scale is not None else tuning["expression_scale"]
        p_style = pose_style if pose_style is not None else int(tuning["pose_style"])

        hasher = hashlib.sha256()
        hasher.update(audio_bytes)
        hasher.update(portrait_id.encode())
        hasher.update(f"{clean_emotion}_{exp_scale}_{p_style}_{size}_{still}".encode())
        input_hash = hasher.hexdigest()

        # Check existing cached completed/processing job
        if input_hash in self.dedup_cache:
            existing_id = self.dedup_cache[input_hash]
            if existing_id in self.jobs:
                existing_record = self.jobs[existing_id]
                if existing_record.status in ("queued", "processing", "completed"):
                    logger.info("Reusing deduplicated SadTalker job", job_id=existing_id)
                    return self._build_response(existing_record)

        job_id = str(uuid4())
        record = JobRecord(
            job_id=job_id,
            portrait_id=portrait_id,
            emotion=clean_emotion,
            audio_hash=input_hash,
        )
        record.duration_seconds = duration
        self.jobs[job_id] = record
        self.dedup_cache[input_hash] = job_id

        # Asynchronously schedule the subprocess
        asyncio.create_task(
            self._execute_job(
                record=record,
                audio_bytes=audio_bytes,
                portrait_path=portrait_path,
                expression_scale=exp_scale,
                pose_style=p_style,
                size=size,
                still=still,
            )
        )

        return self._build_response(record)

    async def _execute_job(
        self,
        record: JobRecord,
        audio_bytes: bytes,
        portrait_path: Path,
        expression_scale: float,
        pose_style: int,
        size: int,
        still: bool,
    ) -> None:
        """Internal subprocess orchestration with timeout, concurrency limits, and cleanup."""
        out_dir = self._ensure_output_dir()
        temp_audio_path = out_dir / f"input_{record.job_id}.wav"
        job_result_dir = out_dir / f"job_{record.job_id}"
        expected_video_path = out_dir / f"video_{record.job_id}.mp4"

        start_time = time.time()
        try:
            # 1. Write audio payload to temporary file
            with open(temp_audio_path, "wb") as f:
                f.write(audio_bytes)

            async with self._semaphore:
                record.status = "processing"
                record.progress = 0.1

                py_bin = (self.workspace_root / settings.SADTALKER_PYTHON_PATH).resolve()
                base_dir = (self.workspace_root / settings.SADTALKER_BASE_PATH).resolve()
                ckpt_dir = (self.workspace_root / settings.SADTALKER_CHECKPOINTS_DIR).resolve()

                cmd = [
                    str(py_bin),
                    "inference.py",
                    "--driven_audio", str(temp_audio_path),
                    "--source_image", str(portrait_path),
                    "--result_dir", str(job_result_dir),
                    "--checkpoint_dir", str(ckpt_dir),
                    "--size", str(size),
                    "--preprocess", "crop",
                    "--expression_scale", str(expression_scale),
                    "--pose_style", str(pose_style),
                    "--batch_size", "1",
                ]
                if still:
                    cmd.append("--still")
                if settings.SADTALKER_DEVICE == "cpu":
                    cmd.append("--cpu")

                logger.info("Spawning SadTalker subprocess", job_id=record.job_id, cmd=cmd)

                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=str(base_dir),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    preexec_fn=os.setsid,  # Create process group for clean cancellation
                )
                record.process = proc

                # Wait with timeout enforcement
                try:
                    stdout, stderr = await asyncio.wait_for(
                        proc.communicate(),
                        timeout=float(settings.SADTALKER_TIMEOUT_SECONDS),
                    )
                except asyncio.TimeoutError:
                    # Cleanly terminate process group
                    if proc.pid:
                        try:
                            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                        except Exception:
                            pass
                    record.status = "failed"
                    record.error = f"Inference timed out after {settings.SADTALKER_TIMEOUT_SECONDS}s"
                    logger.error("SadTalker job timed out", job_id=record.job_id)
                    return

                if proc.returncode != 0:
                    err_msg = stderr.decode(errors="replace")[-500:] if stderr else "Non-zero exit code"
                    record.status = "failed"
                    record.error = f"Subprocess failed (exit {proc.returncode}): {err_msg}"
                    logger.error("SadTalker subprocess failed", job_id=record.job_id, error=record.error)
                    return

                # Locate generated video file
                generated_videos = list(job_result_dir.glob("*.mp4"))
                if not generated_videos:
                    # Check if inference moved it to {job_result_dir}.mp4
                    parent_candidate = Path(str(job_result_dir) + ".mp4")
                    if parent_candidate.exists():
                        generated_videos = [parent_candidate]

                if not generated_videos or not generated_videos[0].exists():
                    record.status = "failed"
                    record.error = "No output video file generated by model"
                    logger.error("Generated video file not found", job_id=record.job_id)
                    return

                # Move final video to stable named location
                shutil.move(str(generated_videos[0]), str(expected_video_path))
                record.video_path = str(expected_video_path)
                record.status = "completed"
                record.progress = 1.0
                record.generation_time_seconds = round(time.time() - start_time, 2)
                record.completed_at = datetime.now(timezone.utc).isoformat()
                logger.info(
                    "SadTalker job completed successfully",
                    job_id=record.job_id,
                    elapsed=record.generation_time_seconds,
                )

        except Exception as e:
            record.status = "failed"
            record.error = str(e)
            logger.exception("Unexpected error in SadTalker execution", job_id=record.job_id)
        finally:
            record.process = None
            # Cleanup temporary input audio and raw intermediate dir
            temp_audio_path.unlink(missing_ok=True)
            if job_result_dir.exists():
                shutil.rmtree(job_result_dir, ignore_errors=True)
            side_candidate = Path(str(job_result_dir) + ".mp4")
            side_candidate.unlink(missing_ok=True)
            self.cleanup_expired_files()

    def cancel_job(self, job_id: str) -> bool:
        """Cancel an in-progress or queued generation job."""
        record = self.jobs.get(job_id)
        if not record:
            return False

        if record.status in ("queued", "processing"):
            if record.process and record.process.pid:
                try:
                    os.killpg(os.getpgid(record.process.pid), signal.SIGTERM)
                except Exception as e:
                    logger.warning("Failed to kill process group for job %s: %s", job_id, e)

            record.status = "cancelled"
            record.error = "Job cancelled by client"
            record.completed_at = datetime.now(timezone.utc).isoformat()
            logger.info("SadTalker job cancelled", job_id=job_id)
            return True

        return False

    def get_job(self, job_id: str) -> Optional[SadTalkerJobResponse]:
        """Fetch current status and metadata of a generation job."""
        record = self.jobs.get(job_id)
        if not record:
            return None
        return self._build_response(record)

    def get_job_video_path(self, job_id: str) -> Optional[Path]:
        """Get absolute path to completed video file, verifying path safety."""
        record = self.jobs.get(job_id)
        if not record or record.status != "completed" or not record.video_path:
            return None

        path = Path(record.video_path).resolve()
        out_dir = self._ensure_output_dir()
        if not str(path).startswith(str(out_dir)):
            raise ValueError("Path traversal violation on video asset")

        if not path.is_file():
            return None

        return path

    def _build_response(self, record: JobRecord) -> SadTalkerJobResponse:
        video_url = f"/api/v1/sadtalker/jobs/{record.job_id}/video" if record.status == "completed" else None
        return SadTalkerJobResponse(
            job_id=record.job_id,
            id=record.job_id,
            status=record.status,
            portrait_id=record.portrait_id,
            emotion=record.emotion,
            progress=record.progress,
            video_url=video_url,
            duration_seconds=record.duration_seconds,
            generation_time_seconds=record.generation_time_seconds,
            error=record.error,
            created_at=record.created_at,
            completed_at=record.completed_at,
        )


def get_sadtalker_service() -> SadTalkerService:
    """Dependency provider for FastAPI."""
    return SadTalkerService.get_instance()
