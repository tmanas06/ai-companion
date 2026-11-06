"""Tests for local voice orchestration, STT, TTS, and turn-taking APIs."""

import io
from uuid import uuid4
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.exceptions import PrivacyViolationError
from app.core.security import create_access_token
from app.main import app
from app.models import Companion, User
from app.providers.stt import (
    MockSpeechToTextProvider,
    get_stt_provider,
)
from app.providers.tts import (
    MockTextToSpeechProvider,
    get_tts_provider,
)
from app.schemas.conversation import ChatResponse
from app.schemas.voice import SynthesizeRequest, VoiceTurnRequest
from app.services.voice import VoiceService


@pytest.mark.asyncio
async def test_mock_stt_transcription():
    provider = MockSpeechToTextProvider(default_text="Testing speech input")
    
    # Empty audio
    empty_res = await provider.transcribe(b"")
    assert empty_res == ""

    # Normal audio
    res = await provider.transcribe(b"dummy_pcm_audio_bytes")
    assert res == "Testing speech input"

    # Injected test transcript
    res_injected = await provider.transcribe(b"RIFF...TEST_TRANSCRIPT: Custom user voice")
    assert res_injected == "Custom user voice"

    # Transcription failure injection
    with pytest.raises(ValueError, match="Audio transcription failed"):
        await provider.transcribe(b"FAIL_TRANSCRIPTION")


@pytest.mark.asyncio
async def test_mock_tts_synthesis():
    provider = MockTextToSpeechProvider()

    # Empty text
    empty_res = await provider.synthesize("")
    assert empty_res == b""

    # Synthesize text
    wav_bytes = await provider.synthesize("Hello companion, how are you?")
    assert len(wav_bytes) > 44
    assert wav_bytes[:4] == b"RIFF"
    assert wav_bytes[8:12] == b"WAVE"

    # Synthesis failure injection
    with pytest.raises(ValueError, match="TTS synthesis failed intentionally"):
        await provider.synthesize("FAIL_SYNTHESIS now")


def test_voice_privacy_enforcement():
    # Attempting to resolve cloud voice providers under strict-local/private-machine must fail
    with pytest.raises(PrivacyViolationError):
        get_stt_provider(provider_type="openai")

    with pytest.raises(PrivacyViolationError):
        get_tts_provider(provider_type="elevenlabs")


@pytest.mark.asyncio
async def test_voice_service_validation():
    # Mock dependencies
    class DummyConvService:
        async def get_conversation(self, user_id, conv_id):
            return None

    service = VoiceService(
        session=None,  # Not used in this direct method call
        conversation_service=DummyConvService(),
        stt_provider=MockSpeechToTextProvider(),
        tts_provider=MockTextToSpeechProvider(),
    )

    with pytest.raises(ValueError, match="Audio data is empty"):
        await service.transcribe_audio(b"")

    empty_tts = await service.synthesize_speech("")
    assert empty_tts == b""


@pytest.mark.asyncio
async def test_voice_endpoints_unauthorized():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Transcribe without auth
        resp = await client.post("/api/v1/voice/transcribe", files={"file": ("test.wav", b"RIFF...", "audio/wav")})
        assert resp.status_code == 401

        # Synthesize without auth
        resp = await client.post("/api/v1/voice/synthesize", json={"text": "Hello"})
        assert resp.status_code == 401

        # Turn without auth
        resp = await client.post("/api/v1/voice/turn", data={"companion_id": str(uuid4())})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_voice_transcribe_and_synthesize_endpoints():
    user_id = uuid4()
    token = create_access_token(data={"sub": str(user_id)})
    headers = {"Authorization": f"Bearer {token}"}

    from app.core.security import get_current_user
    mock_user = User(id=user_id, email="voice_user@example.com", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Transcribe endpoint
            resp = await client.post(
                "/api/v1/voice/transcribe",
                headers=headers,
                files={"file": ("test.wav", b"RIFF...TEST_TRANSCRIPT: My speech", "audio/wav")},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["text"] == "My speech"

            # Empty file should 400
            empty_resp = await client.post(
                "/api/v1/voice/transcribe",
                headers=headers,
                files={"file": ("test.wav", b"", "audio/wav")},
            )
            assert empty_resp.status_code == 400

            # 2. Synthesize endpoint
            synth_resp = await client.post(
                "/api/v1/voice/synthesize",
                headers=headers,
                json={"text": "Welcome back!"},
            )
            assert synth_resp.status_code == 200
            assert synth_resp.headers["content-type"] == "audio/wav"
            assert synth_resp.content[:4] == b"RIFF"

            # 3. Missing fields on turn endpoint
            bad_turn = await client.post(
                "/api/v1/voice/turn",
                headers=headers,
                data={"companion_id": str(uuid4())},
            )
            assert bad_turn.status_code == 400

            # 4. Turn JSON with missing text
            bad_json = await client.post(
                "/api/v1/voice/turn-json",
                headers=headers,
                json={"companion_id": str(uuid4()), "text": ""},
            )
            assert bad_json.status_code == 400
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_voice_turn_orchestration_service():
    from types import SimpleNamespace

    user_id = uuid4()
    companion_id = uuid4()
    conv_id = uuid4()

    mock_comp = SimpleNamespace(
        id=companion_id,
        user_id=user_id,
        name="Aria",
        is_active=True,
    )

    mock_msg = SimpleNamespace(
        id=uuid4(),
        content="I hear you loud and clear.",
        model="mock-ollama",
    )

    mock_conv = SimpleNamespace(id=conv_id)

    class MockConvService:
        async def get_conversation(self, uid, cid):
            return mock_conv

        async def chat(self, uid, req, background_tasks=None):
            return mock_conv, mock_msg, mock_msg

    class MockSession:
        async def execute(self, query):
            class Res:
                def scalar_one_or_none(self):
                    return mock_comp
            return Res()

    service = VoiceService(
        session=MockSession(),
        conversation_service=MockConvService(),
        stt_provider=MockSpeechToTextProvider(default_text="Hello Aria"),
        tts_provider=MockTextToSpeechProvider(),
    )

    turn_res = await service.execute_voice_turn(
        user_id=user_id,
        companion_id=companion_id,
        conversation_id=conv_id,
        audio_bytes=b"dummy_audio",
    )

    assert turn_res.transcript == "Hello Aria"
    assert turn_res.reply_text == "I hear you loud and clear."
    assert turn_res.companion_name == "Aria"
    assert turn_res.audio_base64 is not None
    assert turn_res.audio_format == "audio/wav"

