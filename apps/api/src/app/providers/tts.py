"""Text-to-Speech (TTS) provider interface and implementations."""

import io
import math
import shutil
import struct
import subprocess
import wave
from abc import ABC, abstractmethod
from typing import Optional

from app.core.config import settings
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError


def create_pcm_wav(text: str, duration_per_word: float = 0.25, sample_rate: int = 16000) -> bytes:
    """Generate a clean, valid PCM 16-bit mono WAV audio byte buffer using only standard library."""
    words = max(1, len(text.strip().split()))
    duration = min(5.0, max(0.5, words * duration_per_word))
    n_samples = int(duration * sample_rate)

    # Gentle harmonic chime (440Hz with modulation)
    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        envelope = math.exp(-3.0 * (t % 0.5))
        tone = math.sin(2.0 * math.pi * 440.0 * t) * 0.3 + math.sin(2.0 * math.pi * 880.0 * t) * 0.1
        sample_val = int(32767.0 * tone * envelope)
        samples.append(max(-32768, min(32767, sample_val)))

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack(f"<{len(samples)}h", *samples))

    return buf.getvalue()


class BaseTextToSpeechProvider(ABC):
    """Abstract base class for Text-to-Speech providers."""

    @property
    @abstractmethod
    def provider_type(self) -> str:
        """Return provider identifier."""

    @property
    @abstractmethod
    def default_voice(self) -> str:
        """Return default voice identifier."""

    @abstractmethod
    async def synthesize(self, text: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
        """Synthesize text into WAV audio bytes."""


class MockTextToSpeechProvider(BaseTextToSpeechProvider):
    """Deterministic, standard-library WAV synthesis provider for testing and fallback."""

    @property
    def provider_type(self) -> str:
        return "mock"

    @property
    def default_voice(self) -> str:
        return "mock-voice"

    async def synthesize(self, text: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")
        return create_pcm_wav(text)


class PiperTTSProvider(BaseTextToSpeechProvider):
    """Local, high-speed neural TTS via Piper."""

    def __init__(self, voice_model: str = "en_US-lessac-medium"):
        self._voice_model = voice_model

    @property
    def provider_type(self) -> str:
        return "piper"

    @property
    def default_voice(self) -> str:
        return self._voice_model

    async def synthesize(self, text: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""

        # Check for piper CLI or python package
        piper_bin = shutil.which("piper")
        if not piper_bin:
            raise ProviderConfigurationError(
                "Local neural TTS engine 'piper' is not installed. "
                "To install local Piper TTS, download the Piper binary or install 'piper-tts'."
            )

        selected_voice = voice or self._voice_model
        cmd = [piper_bin, "--model", selected_voice, "--output_file", "-"]
        try:
            proc = subprocess.run(
                cmd,
                input=text.encode("utf-8"),
                capture_output=True,
                check=True,
            )
            return proc.stdout
        except Exception as e:
            raise ValueError(f"Piper TTS synthesis failed: {e}") from e


class SystemTTSProvider(BaseTextToSpeechProvider):
    """Local, lightweight speech synthesis using system espeak / espeak-ng."""

    @property
    def provider_type(self) -> str:
        return "system"

    @property
    def default_voice(self) -> str:
        return "default"

    async def synthesize(self, text: str, voice: Optional[str] = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""

        espeak_bin = shutil.which("espeak-ng") or shutil.which("espeak")
        if not espeak_bin:
            raise ProviderConfigurationError(
                "System speech engine 'espeak-ng' is not installed. "
                "Run 'sudo apt-get install espeak-ng' to enable system speech synthesis."
            )

        cmd = [espeak_bin, "--stdout", text]
        if voice:
            cmd.extend(["-v", voice])
        try:
            proc = subprocess.run(cmd, capture_output=True, check=True)
            return proc.stdout
        except Exception as e:
            raise ValueError(f"System TTS synthesis failed: {e}") from e


def get_tts_provider(provider_type: Optional[str] = None) -> BaseTextToSpeechProvider:
    """Factory resolving TTS provider with privacy mode validation."""
    privacy_mode = settings.PRIVACY_MODE
    req_type = (provider_type or getattr(settings, "TTS_PROVIDER", None) or "mock").lower().strip()

    if req_type in ("cloud", "elevenlabs", "openai", "azure", "aws-polly", "google"):
        if privacy_mode in ("strict-local", "private-machine"):
            raise PrivacyViolationError(
                f"Hosted cloud TTS provider '{req_type}' is prohibited under {privacy_mode} privacy mode."
            )

    if req_type == "piper":
        return PiperTTSProvider(voice_model=getattr(settings, "TTS_VOICE", "en_US-lessac-medium"))
    if req_type == "system":
        return SystemTTSProvider()

    # Default to Mock/Standard-library WAV provider
    return MockTextToSpeechProvider()
