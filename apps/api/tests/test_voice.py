"""Tests for local voice orchestration, STT, TTS, and turn-taking APIs."""

import io
from types import SimpleNamespace
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


def test_edge_tts_provider_resolution():
    from app.providers.tts import EdgeTTSProvider

    provider = EdgeTTSProvider()
    assert provider.resolve_voice("Marcus") == "en-US-GuyNeural"
    assert provider.resolve_voice("Atlas") == "en-US-ChristopherNeural"
    assert provider.resolve_voice("Kai") == "en-US-AndrewNeural"
    assert provider.resolve_voice("Aria") == "en-US-JennyNeural"
    assert provider.resolve_voice("Luna") == "en-US-AvaNeural"
    assert provider.resolve_voice("Nova") == "en-US-AriaNeural"
    assert provider.resolve_voice("Sage") == "en-US-MichelleNeural"
    assert provider.resolve_voice("Maya") == "en-CA-ClaraNeural"
    assert provider.resolve_voice("en-US-BrianNeural") == "en-US-BrianNeural"
    assert provider.resolve_voice("unknown male character") == "en-US-GuyNeural"
    assert provider.resolve_voice("unknown female character") == "en-US-JennyNeural"


@pytest.mark.asyncio
async def test_voice_greeting_orchestration():
    user_id = uuid4()
    companion_id = uuid4()
    conv_id = uuid4()
    mock_comp = SimpleNamespace(
        id=companion_id,
        name="Luna",
        user_id=user_id,
        is_active=True,
    )
    mock_conv = SimpleNamespace(id=conv_id)
    added_messages = []

    class MockConvService:
        async def get_conversation(self, uid, cid):
            return mock_conv

        async def get_recent_messages(self, cid, limit=5):
            return []

        async def add_message(self, cid, data):
            msg = SimpleNamespace(id=uuid4(), content=data.content, role=data.role)
            added_messages.append(msg)
            return msg

    class MockSession:
        async def execute(self, query):
            class Res:
                def scalar_one_or_none(self):
                    return mock_comp
            return Res()

    service = VoiceService(
        session=MockSession(),
        conversation_service=MockConvService(),
        stt_provider=MockSpeechToTextProvider(),
        tts_provider=MockTextToSpeechProvider(),
    )

    greeting_res = await service.execute_greeting(
        user_id=user_id,
        companion_id=companion_id,
        conversation_id=conv_id,
    )

    assert greeting_res.companion_name == "Luna"
    assert "excited to chat" in greeting_res.reply_text or "Luna" in greeting_res.reply_text
    assert greeting_res.user_message_id is None
    assert greeting_res.assistant_message_id is not None
    assert greeting_res.audio_base64 is not None
    assert len(added_messages) == 1
    assert added_messages[0].role == "assistant"


def test_clean_text_for_speech():
    from app.providers.tts import clean_text_for_speech

    # Empty
    assert clean_text_for_speech("") == ""

    # Normal text
    assert clean_text_for_speech("Hello there!") == "Hello there!"

    # Code block removal
    input_text = "Here is the code: ```python\nprint('hello')\n``` Enjoy it!"
    assert clean_text_for_speech(input_text) == "Here is the code: Enjoy it!"

    # Markdown links
    assert clean_text_for_speech("Check [this site](https://example.com) for details") == "Check this site for details"

    # Stage directions and emojis
    input_text = "*smiles gently* It is wonderful to see you today! How can I help? 😊 (laughs)"
    assert clean_text_for_speech(input_text) == "It is wonderful to see you today! How can I help?"


@pytest.mark.asyncio
async def test_elevenlabs_tts_provider():
    from app.core.exceptions import ProviderConfigurationError
    from app.providers.tts import ElevenLabsTTSProvider

    # Test voice resolution
    provider = ElevenLabsTTSProvider(api_key="test_api_key")
    assert provider.provider_type == "elevenlabs"
    assert provider.resolve_voice_id("Aria") == "21m00Tcm4TlvDq8ikWAM"
    assert provider.resolve_voice_id("Rachel") == "21m00Tcm4TlvDq8ikWAM"
    assert provider.resolve_voice_id("Marcus") == "pNInz6obpgDQGcFmaJgB"
    assert provider.resolve_voice_id("Adam") == "pNInz6obpgDQGcFmaJgB"
    assert provider.resolve_voice_id("custom_id_123456789") == "custom_id_123456789"

    # Test missing API key
    no_key_provider = ElevenLabsTTSProvider(api_key=None)
    with pytest.raises(ProviderConfigurationError, match="ElevenLabs API key is not configured"):
        no_key_provider._get_headers()


def test_companion_gender_voice_enforcement():
    from app.services.voice import infer_companion_gender, resolve_gender_appropriate_voice

    # 1. Gender inference
    assert infer_companion_gender("Marcus") == "male"
    assert infer_companion_gender("Kai") == "male"
    assert infer_companion_gender("Atlas") == "male"
    assert infer_companion_gender("Aria") == "female"
    assert infer_companion_gender("Luna") == "female"
    assert infer_companion_gender("Nova") == "female"
    assert infer_companion_gender("Custom", {"gender": "male"}) == "male"
    assert infer_companion_gender("Custom", {"gender": "female"}) == "female"

    # 2. Male companion (Marcus) voice enforcement: female voices must be rejected and overridden
    # ElevenLabs provider
    marcus_el = resolve_gender_appropriate_voice("en-US-JennyNeural", "Marcus", "male", "elevenlabs")
    assert marcus_el == "pNInz6obpgDQGcFmaJgB"  # Adam

    marcus_el_rachel = resolve_gender_appropriate_voice("Rachel", "Marcus", "male", "elevenlabs")
    assert marcus_el_rachel == "pNInz6obpgDQGcFmaJgB"  # Adam

    marcus_el_empty = resolve_gender_appropriate_voice(None, "Marcus", "male", "elevenlabs")
    assert marcus_el_empty == "pNInz6obpgDQGcFmaJgB"

    # EdgeTTS provider
    marcus_edge = resolve_gender_appropriate_voice("en-US-JennyNeural", "Marcus", "male", "edge-tts")
    assert marcus_edge == "en-US-GuyNeural"

    # 3. Female companion (Aria) voice enforcement: male voices must be rejected and overridden
    # ElevenLabs provider
    aria_el = resolve_gender_appropriate_voice("Adam", "Aria", "female", "elevenlabs")
    assert aria_el == "21m00Tcm4TlvDq8ikWAM"  # Rachel

    aria_el_guy = resolve_gender_appropriate_voice("en-US-GuyNeural", "Aria", "female", "elevenlabs")
    assert aria_el_guy == "21m00Tcm4TlvDq8ikWAM"  # Rachel

    aria_el_empty = resolve_gender_appropriate_voice(None, "Aria", "female", "elevenlabs")
    assert aria_el_empty == "21m00Tcm4TlvDq8ikWAM"

    # EdgeTTS provider
    aria_edge = resolve_gender_appropriate_voice("en-US-GuyNeural", "Aria", "female", "edge-tts")
    assert aria_edge == "en-US-JennyNeural"



