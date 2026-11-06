"""Tests for SadTalker service, security validation, job lifecycle, and endpoints."""

import base64
import os
import uuid
from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.exceptions import ProviderConfigurationError
from app.core.security import get_current_user
from app.main import app
from app.models import User
from app.schemas.sadtalker import (
    SadTalkerJobResponse,
    SadTalkerJobStatus,
    SadTalkerServiceStatus,
)
from app.services.sadtalker import (
    SadTalkerService,
    get_sadtalker_service,
)


@pytest.mark.asyncio
async def test_sadtalker_service_default_disabled():
    """Verify that SadTalker service defaults to disabled and safe defaults."""
    settings = get_settings()
    # Default configuration must preserve working application without forcing inference
    assert settings.SADTALKER_ENABLED is False

    service = SadTalkerService()
    status = service.get_service_status()
    assert status.enabled is False
    assert status.available is False
    assert status.device == "cpu"
    assert settings.SADTALKER_TIMEOUT_SECONDS > 0
    assert settings.SADTALKER_MAX_AUDIO_SECONDS > 0


@pytest.mark.asyncio
async def test_sadtalker_portrait_path_validation_and_traversal_prevention():
    """Verify path traversal protection on portrait IDs."""
    service = SadTalkerService()

    # 1. Allowed canonical IDs
    resolved_aria = service.resolve_portrait_path("aria")
    assert resolved_aria is not None
    assert resolved_aria.exists()
    assert "aria-portrait" in resolved_aria.name

    resolved_default = service.resolve_portrait_path(None)
    assert resolved_default is not None
    assert resolved_default.exists()

    # 2. Path traversal attempts MUST raise ValueError
    with pytest.raises(ValueError, match="not in approved whitelist"):
        service.resolve_portrait_path("../../etc/passwd")

    with pytest.raises(ValueError, match="not in approved whitelist"):
        service.resolve_portrait_path("/etc/shadow")

    with pytest.raises(ValueError, match="not in approved whitelist"):
        service.resolve_portrait_path("../../../app/core/config.py")

    with pytest.raises(ValueError, match="not in approved whitelist"):
        service.resolve_portrait_path("unknown_external_portrait_id")


@pytest.mark.asyncio
async def test_sadtalker_input_audio_validation():
    """Verify audio data validation for empty or oversized inputs."""
    service = SadTalkerService()

    # 1. Empty audio
    with pytest.raises(ValueError, match="empty or too short"):
        await service.submit_job(audio_bytes=b"")

    # 2. Oversized audio (simulated excessively large buffer)
    oversized_bytes = b"0" * (1024 * 1024 * 25)  # 25 MB
    with pytest.raises(ValueError, match="exceeds maximum limit"):
        await service.submit_job(audio_bytes=oversized_bytes)


@pytest.mark.asyncio
async def test_sadtalker_disabled_rejection():
    """Verify that job submission is rejected when SadTalker is disabled."""
    service = SadTalkerService()
    test_audio = b"RIFF....WAVEfmt ....data....sample_pcm_audio_for_test"

    with pytest.raises(ProviderConfigurationError, match="SadTalker service is disabled"):
        await service.submit_job(audio_bytes=test_audio, portrait_id="aria")


@pytest.mark.asyncio
async def test_sadtalker_job_deduplication_and_cancellation():
    """Verify job deduplication on identical audio hashes and cancellation lifecycle."""
    import app.services.sadtalker as sadtalker_mod
    service = SadTalkerService()
    test_audio = b"RIFF....WAVEfmt ....data....sample_pcm_audio_for_test"

    with patch.object(sadtalker_mod.settings, "SADTALKER_ENABLED", True), \
         patch.object(service, "get_service_status", return_value=SadTalkerServiceStatus(
             enabled=True,
             available=True,
             device="cpu",
             python_path="/mock/python",
             checkpoints_dir="/mock/checkpoints",
             checkpoints_found=True,
             max_concurrent_jobs=1,
             queue_size=0,
             active_jobs=0,
         )), \
         patch.object(service, "_execute_job", new_callable=AsyncMock):

        # 1. Submit job
        job = await service.submit_job(
            audio_bytes=test_audio,
            portrait_id="aria",
            emotion="neutral",
        )
        assert job.id is not None
        assert job.status in ("queued", "processing", "completed")

        # 2. Re-submitting identical audio within cache window returns identical job ID (deduplication)
        dup_job = await service.submit_job(
            audio_bytes=test_audio,
            portrait_id="aria",
            emotion="neutral",
        )
        assert dup_job.id == job.id

        # 3. Retrieve job status
        retrieved = service.get_job(job.id)
        assert retrieved is not None
        assert retrieved.id == job.id

        # 4. Cancel job
        cancelled = service.cancel_job(job.id)
        assert cancelled is True
        cancelled_job = service.get_job(job.id)
        assert cancelled_job.status == "cancelled"


@pytest.mark.asyncio
async def test_sadtalker_api_status_endpoint():
    """Verify GET /api/v1/sadtalker/status response format for authenticated user."""
    user = User(id=uuid.uuid4(), email=f"sadtalker_status_{uuid.uuid4()}@example.com", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/sadtalker/status")
            assert res.status_code == 200
            data = res.json()
            assert "enabled" in data
            assert "available" in data
            assert "device" in data
            assert "checkpoints_found" in data
            assert "max_concurrent_jobs" in data
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_sadtalker_api_security_path_traversal_rejection():
    """Verify HTTP API rejects path traversal in portrait_id with 400 Bad Request."""
    user = User(id=uuid.uuid4(), email=f"sadtalker_sec_{uuid.uuid4()}@example.com", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            dummy_wav = b"RIFF" + b"\x00" * 40 + b"WAVEfmt "
            b64_audio = base64.b64encode(dummy_wav).decode()

            payload = {
                "audio_base64": b64_audio,
                "portrait_id": "../../etc/shadow",
            }
            res = await client.post("/api/v1/sadtalker/jobs", data=payload)
            assert res.status_code == 400
            assert "not in approved whitelist" in res.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_sadtalker_api_service_disabled_response():
    """Verify HTTP API returns 503 when SadTalker is disabled."""
    user = User(id=uuid.uuid4(), email=f"sadtalker_disabled_{uuid.uuid4()}@example.com", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            dummy_wav = b"RIFF" + b"\x00" * 40 + b"WAVEfmt "
            b64_audio = base64.b64encode(dummy_wav).decode()

            res = await client.post(
                "/api/v1/sadtalker/jobs",
                data={"audio_base64": b64_audio, "portrait_id": "aria"},
            )
            assert res.status_code == 503
            assert "disabled" in res.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_sadtalker_api_job_lifecycle():
    """Verify job submission, status checking, and cancellation via HTTP API when enabled."""
    user = User(id=uuid.uuid4(), email=f"sadtalker_lifecycle_{uuid.uuid4()}@example.com", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user

    import app.services.sadtalker as sadtalker_mod
    settings = get_settings()
    service = get_sadtalker_service()

    with patch.object(sadtalker_mod.settings, "SADTALKER_ENABLED", True), \
         patch.object(service, "get_service_status", return_value=SadTalkerServiceStatus(
             enabled=True,
             available=True,
             device="cpu",
             python_path="/mock/python",
             checkpoints_dir="/mock/checkpoints",
             checkpoints_found=True,
             max_concurrent_jobs=1,
             queue_size=0,
             active_jobs=0,
         )), \
         patch.object(service, "_execute_job", new_callable=AsyncMock):

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                dummy_wav = b"RIFF" + b"\x00" * 40 + b"WAVEfmt "
                b64_audio = base64.b64encode(dummy_wav).decode()

                # 1. Submit job via form data
                submit_res = await client.post(
                    "/api/v1/sadtalker/jobs",
                    data={"audio_base64": b64_audio, "portrait_id": "aria"},
                )
                assert submit_res.status_code == 202
                job_data = submit_res.json()
                job_id = job_data["id"]
                assert job_id is not None

                # 2. Query status
                query_res = await client.get(f"/api/v1/sadtalker/jobs/{job_id}")
                assert query_res.status_code == 200
                assert query_res.json()["id"] == job_id

                # 3. Nonexistent job
                missing_res = await client.get(f"/api/v1/sadtalker/jobs/{uuid.uuid4()}")
                assert missing_res.status_code == 404

                # 4. Cancel job
                delete_res = await client.delete(f"/api/v1/sadtalker/jobs/{job_id}")
                assert delete_res.status_code == 200
                assert delete_res.json()["status"] == "cancelled"
        finally:
            app.dependency_overrides.pop(get_current_user, None)
