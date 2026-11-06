"""Text-to-Speech (TTS) provider interface and implementations."""

import io
import json
import math
import shutil
import struct
import subprocess
import wave
import time
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

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
    async def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        """Synthesize text into WAV audio bytes."""

    @abstractmethod
    async def stream_synthesize(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[bytes]:  # type: ignore[misc]
        """Yield audio chunks incrementally as they are generated.

        Providers that do not support genuine incremental synthesis should
        raise NotImplementedError. Implementations must not buffer the entire
        response before yielding the first chunk unless the underlying engine
        does not support streaming.
        """
        raise NotImplementedError("streaming synthesis is not supported by this provider")

    @abstractmethod
    async def stream_with_timestamps(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[dict[str, object]]:  # type: ignore[misc]
        """Yield audio chunks with word-level alignment timestamps.

        Returns NDJSON-style dicts with:
        - "audio": base64 encoded audio chunk
        - "alignment": {"characters": [...], "character_start_times_seconds": [...], "character_end_times_seconds": [...]}
          or word-level: {"words": [...], "word_start_times_seconds": [...], "word_end_times_seconds": [...]}

        Providers that do not support timestamp alignment should raise NotImplementedError.
        """
        raise NotImplementedError("streaming synthesis with timestamps is not supported by this provider")


class MockTextToSpeechProvider(BaseTextToSpeechProvider):
    """Deterministic, standard-library WAV synthesis provider for testing and fallback."""

    @property
    def provider_type(self) -> str:
        return "mock"

    @property
    def default_voice(self) -> str:
        return "mock-voice"

    async def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")
        return create_pcm_wav(text)

    async def stream_synthesize(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[bytes]:  # type: ignore[override]
        if not text or not text.strip():
            return
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")
        wav = create_pcm_wav(text)
        yield wav

    async def stream_with_timestamps(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[dict[str, object]]:  # type: ignore[override]
        if not text or not text.strip():
            return
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")
        wav = create_pcm_wav(text)
        import base64
        yield {
            "audio": base64.b64encode(wav).decode("ascii"),
            "alignment": {
                "words": text.strip().split(),
                "word_start_times_seconds": [i * 0.3 for i in range(len(text.strip().split()))],
                "word_end_times_seconds": [(i + 1) * 0.3 for i in range(len(text.strip().split()))],
            }
        }


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

    async def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""

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

    async def stream_synthesize(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[bytes]:  # type: ignore[override]
        raise NotImplementedError(
            "Piper TTS does not support streaming synthesis; use synthesize() instead."
        )

    async def stream_with_timestamps(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[dict[str, object]]:  # type: ignore[override]
        raise NotImplementedError(
            "Piper TTS does not support streaming synthesis with timestamps; use synthesize() instead."
        )


class SystemTTSProvider(BaseTextToSpeechProvider):
    """Local, lightweight speech synthesis using system espeak / espeak-ng."""

    @property
    def provider_type(self) -> str:
        return "system"

    @property
    def default_voice(self) -> str:
        return "default"

    async def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
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

    async def stream_synthesize(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[bytes]:  # type: ignore[override]
        raise NotImplementedError(
            "System TTS does not support streaming synthesis; use synthesize() instead."
        )

    async def stream_with_timestamps(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[dict[str, object]]:  # type: ignore[override]
        raise NotImplementedError(
            "System TTS does not support streaming synthesis with timestamps; use synthesize() instead."
        )


def clean_text_for_speech(text: str) -> str:
    """Prepare text for TTS by stripping markdown, actions, emojis, and unpronounceable symbols.

    Ensures natural conversational prosody matching the ElevenLabs text normalization pipeline.
    """
    if not text or not text.strip():
        return ""

    import re

    # 1. Remove code blocks
    cleaned = re.sub(r"```[\s\S]*?```", "", text)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)

    # 2. Convert markdown links: [label](url) -> label
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)

    # 3. Strip stage directions / action asterisks / italic thoughts: *smiles warmly*, _sighs_
    cleaned = re.sub(r"\*[^*]+\*", "", cleaned)
    cleaned = re.sub(r"_[^_]+_", "", cleaned)

    # 4. Strip parenthetical emotional cues: (laughs), (chuckles), (pause), (whispering)
    cleaned = re.sub(
        r"\((?:laughs|chuckles|sighs|smiles|giggles|pause|whispers|gasp|cries)\)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # 5. Strip markdown headers, bullets, and blockquotes
    cleaned = re.sub(r"^#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^[-*+]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^>\s+", "", cleaned, flags=re.MULTILINE)

    # 6. Strip emojis that cause speech engines to awkwardly read out Unicode character names
    cleaned = re.sub(r"[\U00010000-\U0010ffff]", "", cleaned)

    # 7. Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or text.strip()


class EdgeTTSProvider(BaseTextToSpeechProvider):
    """High-fidelity, studio-grade neural speech synthesis via Edge TTS."""

    VOICE_MAP = {
        # Character names
        "marcus": "en-US-GuyNeural",
        "atlas": "en-US-ChristopherNeural",
        "kai": "en-US-AndrewNeural",
        "aria": "en-US-JennyNeural",
        "luna": "en-US-AvaNeural",
        "nova": "en-US-AriaNeural",
        "sage": "en-US-MichelleNeural",
        "maya": "en-CA-ClaraNeural",
        "jenny": "en-US-JennyNeural",
        # ElevenLabs Voice IDs and names mapped to Edge-TTS neural equivalents
        "pninz6obpgdqgcfmajgb": "en-US-GuyNeural",        # Adam -> Guy
        "adam": "en-US-GuyNeural",
        "jbfqncbsd6rmkjvdrzzb": "en-US-ChristopherNeural", # George -> Christopher
        "george": "en-US-ChristopherNeural",
        "tx3lpaxmhkxfdv7voqhj": "en-US-AndrewNeural",      # Liam -> Andrew
        "liam": "en-US-AndrewNeural",
        "bihbv24mwmergaszh58o": "en-US-BrianNeural",       # Will -> Brian
        "will": "en-US-BrianNeural",
        "ikne3meq5asn9xlyudcd": "en-US-GuyNeural",         # Charlie -> Guy
        "charlie": "en-US-GuyNeural",
        "21m00tcm4tlvdq8ikwam": "en-US-JennyNeural",       # Rachel -> Jenny
        "rachel": "en-US-JennyNeural",
        "exavitqu4vr4xnsdxmal": "en-US-AvaNeural",         # Sarah -> Ava
        "sarah": "en-US-AvaNeural",
        "xb0fdunxu5powfxdhcwa": "en-US-AriaNeural",        # Charlotte -> Aria
        "charlotte": "en-US-AriaNeural",
        "pfzp5jqg7iqjiquc4bku": "en-US-MichelleNeural",    # Lily -> Michelle
        "lily": "en-US-MichelleNeural",
        "cgsgspj2msm6clmckdw9": "en-CA-ClaraNeural",       # Jessica -> Clara
        "jessica": "en-CA-ClaraNeural",
    }

    def __init__(self, default_voice: str = "en-US-JennyNeural"):
        self._default_voice = default_voice

    @property
    def provider_type(self) -> str:
        return "edge-tts"

    @property
    def default_voice(self) -> str:
        return self._default_voice

    def resolve_voice(self, voice: str | None = None) -> str:
        if not voice:
            return self._default_voice
        v_clean = voice.strip().lower()
        if v_clean in self.VOICE_MAP:
            return self.VOICE_MAP[v_clean]
        if "neural" in voice.lower():
            return voice
        if "female" in v_clean or any(kw in v_clean for kw in ("zira", "jenny", "samantha", "woman")):
            return "en-US-JennyNeural"
        if "male" in v_clean or any(kw in v_clean for kw in ("david", "guy", "alex", "daniel", "man")):
            return "en-US-GuyNeural"
        return self._default_voice

    async def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")

        import edge_tts

        norm_text = clean_text_for_speech(text)
        selected_voice = self.resolve_voice(voice)
        rate_str = "+0%"
        if speed != 1.0:
            pct = int((speed - 1.0) * 100)
            rate_str = f"+{pct}%" if pct >= 0 else f"{pct}%"

        try:
            communicate = edge_tts.Communicate(norm_text, selected_voice, rate=rate_str)
            audio_chunks: list[bytes] = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
            return b"".join(audio_chunks)
        except Exception as e:
            raise ValueError(f"Edge TTS synthesis failed: {e}") from e

    async def stream_synthesize(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[bytes]:  # type: ignore[override]
        """Stream MP3 audio chunks incrementally as Edge TTS generates them.

        Uses edge_tts.Communicate.stream() which yields audio chunks as they
        are produced by the TTS engine, without buffering the full response.
        """
        if not text or not text.strip():
            return
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")

        import edge_tts

        norm_text = clean_text_for_speech(text)
        selected_voice = self.resolve_voice(voice)
        rate_str = "+0%"
        if speed != 1.0:
            pct = int((speed - 1.0) * 100)
            rate_str = f"+{pct}%" if pct >= 0 else f"{pct}%"

        try:
            communicate = edge_tts.Communicate(norm_text, selected_voice, rate=rate_str)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception as e:
            raise ValueError(f"Edge TTS streaming failed: {e}") from e

    async def stream_with_timestamps(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[dict[str, object]]:  # type: ignore[override]
        """Stream MP3 audio chunks with word-level alignment timestamps.

        Uses edge_tts.Communicate.stream() which yields both audio chunks
        and WordBoundary events with precise timing information.
        """
        if not text or not text.strip():
            return
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")

        import base64
        import edge_tts

        norm_text = clean_text_for_speech(text)
        selected_voice = self.resolve_voice(voice)
        rate_str = "+0%"
        if speed != 1.0:
            pct = int((speed - 1.0) * 100)
            rate_str = f"+{pct}%" if pct >= 0 else f"{pct}%"

        try:
            communicate = edge_tts.Communicate(
                norm_text,
                selected_voice,
                rate=rate_str,
                boundary="WordBoundary",
            )

            # Collect word boundaries as they arrive
            word_boundaries: list[dict[str, object]] = []

            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield {
                        "audio": base64.b64encode(chunk["data"]).decode("ascii"),
                        "alignment": {
                            "words": [wb["text"] for wb in word_boundaries],
                            "word_start_times_seconds": [float(wb["offset"]) / 10_000_000 for wb in word_boundaries],
                            "word_end_times_seconds": [(float(wb["offset"]) + float(wb["duration"])) / 10_000_000 for wb in word_boundaries],
                        },
                    }
                elif chunk["type"] == "WordBoundary":
                    word_boundaries.append({
                        "text": chunk["text"],
                        "offset": chunk["offset"],
                        "duration": chunk["duration"],
                    })
        except Exception as e:
            raise ValueError(f"Edge TTS streaming with timestamps failed: {e}") from e


class ElevenLabsTTSProvider(BaseTextToSpeechProvider):
    """Studio-grade, emotive speech synthesis via ElevenLabs API."""

    VOICE_MAP = {
        # Female voices
        "aria": "21m00Tcm4TlvDq8ikWAM",      # Rachel (calm, warm, conversational)
        "rachel": "21m00Tcm4TlvDq8ikWAM",
        "21m00tcm4tlvdq8ikwam": "21m00Tcm4TlvDq8ikWAM",
        "sarah": "EXAVITQu4vr4xnSDxMaL",     # Sarah (soft, expressive)
        "luna": "EXAVITQu4vr4xnSDxMaL",
        "exavitqu4vr4xnsdxmal": "EXAVITQu4vr4xnSDxMaL",
        "nova": "XB0fDUnXU5powFXDhCwa",      # Charlotte (clear, confident)
        "charlotte": "XB0fDUnXU5powFXDhCwa",
        "xb0fdunxu5powfxdhcwa": "XB0fDUnXU5powFXDhCwa",
        "sage": "pFZP5JQG7iQjIQuC4Bku",      # Lily (warm, soothing)
        "lily": "pFZP5JQG7iQjIQuC4Bku",
        "pfzp5jqg7iqjiquc4bku": "pFZP5JQG7iQjIQuC4Bku",
        "maya": "cgSgspJ2msm6clMCkdW9",      # Jessica (friendly, bright)
        "jessica": "cgSgspJ2msm6clMCkdW9",
        "cgsgspj2msm6clmckdw9": "cgSgspJ2msm6clMCkdW9",
        "female": "21m00Tcm4TlvDq8ikWAM",
        "jenny": "21m00Tcm4TlvDq8ikWAM",
        "zira": "21m00Tcm4TlvDq8ikWAM",
        "samantha": "21m00Tcm4TlvDq8ikWAM",
        # Edge-TTS female voices mapped to ElevenLabs
        "en-us-jennyneural": "21m00Tcm4TlvDq8ikWAM",
        "en-us-arianeural": "21m00Tcm4TlvDq8ikWAM",
        "en-us-avaneural": "EXAVITQu4vr4xnSDxMaL",
        "en-us-michelleneural": "pFZP5JQG7iQjIQuC4Bku",
        "en-ca-claraneural": "cgSgspJ2msm6clMCkdW9",
        "en-gb-sonianeural": "21m00Tcm4TlvDq8ikWAM",

        # Male voices
        "marcus": "pNInz6obpgDQGcFmaJgB",    # Adam (deep, narrative)
        "adam": "pNInz6obpgDQGcFmaJgB",
        "pninz6obpgdqgcfmajgb": "pNInz6obpgDQGcFmaJgB",
        "atlas": "JBFqnCBsd6RMkjVDRZzb",     # George (warm, articulate)
        "george": "JBFqnCBsd6RMkjVDRZzb",
        "jbfqncbsd6rmkjvdrzzb": "JBFqnCBsd6RMkjVDRZzb",
        "kai": "TX3LPaxmHKxFdv7VOQHJ",       # Liam (youthful, energetic)
        "liam": "TX3LPaxmHKxFdv7VOQHJ",
        "tx3lpaxmhkxfdv7voqhj": "TX3LPaxmHKxFdv7VOQHJ",
        "will": "bIHbv24MWmeRgasZH58o",
        "bihbv24mwmergaszh58o": "bIHbv24MWmeRgasZH58o",
        "charlie": "IKne3meq5aSn9XLyUdCD",
        "ikne3meq5asn9xlyudcd": "IKne3meq5aSn9XLyUdCD",
        "male": "pNInz6obpgDQGcFmaJgB",
        "guy": "pNInz6obpgDQGcFmaJgB",
        "david": "pNInz6obpgDQGcFmaJgB",
        "daniel": "pNInz6obpgDQGcFmaJgB",
        # Edge-TTS male voices mapped to ElevenLabs
        "en-us-guyneural": "pNInz6obpgDQGcFmaJgB",
        "en-us-christopherneural": "JBFqnCBsd6RMkjVDRZzb",
        "en-us-andrewneural": "TX3LPaxmHKxFdv7VOQHJ",
        "en-us-brianneural": "bIHbv24MWmeRgasZH58o",
        "en-gb-ryanneural": "JBFqnCBsd6RMkjVDRZzb",
    }

    def __init__(
        self,
        api_key: str | None = None,
        model_id: str | None = None,
        default_voice: str | None = None,
    ):
        self._api_key = api_key or getattr(settings, "ELEVENLABS_API_KEY", None)
        self._model_id = model_id or getattr(settings, "ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
        self._default_voice = default_voice or getattr(settings, "ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    @property
    def provider_type(self) -> str:
        return "elevenlabs"

    @property
    def default_voice(self) -> str:
        return self._default_voice

    def resolve_voice_id(self, voice: str | None = None) -> str:
        if not voice:
            return self._default_voice
        v_clean = voice.strip().lower()
        if v_clean in self.VOICE_MAP:
            return self.VOICE_MAP[v_clean]
        if len(voice.strip()) >= 10 and " " not in voice and not voice.strip().lower().startswith("en-"):
            return voice.strip()
        return self._default_voice

    def _get_headers(self) -> dict[str, str]:
        if not self._api_key:
            raise ProviderConfigurationError(
                "ElevenLabs API key is not configured. "
                "Set ELEVENLABS_API_KEY in .env to enable studio-grade ElevenLabs voice synthesis."
            )
        return {
            "xi-api-key": self._api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

    async def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        if not text or not text.strip():
            return b""
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")

        import httpx

        norm_text = clean_text_for_speech(text)
        voice_id = self.resolve_voice_id(voice)
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"

        payload = {
            "text": norm_text,
            "model_id": self._model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
                "speed": speed,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, headers=self._get_headers(), json=payload)
                if res.status_code != 200:
                    err_msg = res.text
                    try:
                        err_json = res.json()
                        err_msg = err_json.get("detail", {}).get("message") or err_json.get("detail") or err_msg
                    except Exception:
                        pass
                    raise ValueError(f"ElevenLabs TTS error ({res.status_code}): {err_msg}")
                return res.content
        except Exception as e:
            if isinstance(e, (ProviderConfigurationError, ValueError)):
                raise
            raise ValueError(f"ElevenLabs TTS synthesis failed: {e}") from e

    async def stream_synthesize(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[bytes]:  # type: ignore[override]
        if not text or not text.strip():
            return
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")

        import httpx

        norm_text = clean_text_for_speech(text)
        voice_id = self.resolve_voice_id(voice)
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=mp3_44100_128"

        payload = {
            "text": norm_text,
            "model_id": self._model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
                "speed": speed,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, headers=self._get_headers(), json=payload) as res:
                    if res.status_code != 200:
                        err = await res.aread()
                        raise ValueError(f"ElevenLabs streaming error ({res.status_code}): {err.decode('utf-8', errors='ignore')}")
                    async for chunk in res.aiter_bytes():
                        if chunk:
                            yield chunk
        except Exception as e:
            if isinstance(e, (ProviderConfigurationError, ValueError)):
                raise
            raise ValueError(f"ElevenLabs streaming failed: {e}") from e

    async def stream_with_timestamps(
        self, text: str, voice: str | None = None, speed: float = 1.0
    ) -> AsyncIterator[dict[str, object]]:  # type: ignore[override]
        if not text or not text.strip():
            return
        if "FAIL_SYNTHESIS" in text:
            raise ValueError("TTS synthesis failed intentionally")

        import httpx

        norm_text = clean_text_for_speech(text)
        voice_id = self.resolve_voice_id(voice)
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream/with-timestamps?output_format=mp3_44100_128"

        headers = self._get_headers()
        headers["Accept"] = "application/x-ndjson"

        payload = {
            "text": norm_text,
            "model_id": self._model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "style": 0.0,
                "use_speaker_boost": True,
                "speed": speed,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as res:
                    if res.status_code != 200:
                        err = await res.aread()
                        raise ValueError(f"ElevenLabs stream timestamps error ({res.status_code}): {err.decode('utf-8', errors='ignore')}")

                    buffer = ""
                    async for chunk in res.aiter_text():
                        buffer += chunk
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                data = json.loads(line)
                                audio_b64 = data.get("audio_base64") or data.get("audio")
                                alignment = data.get("alignment") or {}

                                words: list[str] = []
                                word_starts: list[float] = []
                                word_ends: list[float] = []

                                chars = alignment.get("characters", [])
                                char_starts = alignment.get("character_start_times_seconds", [])
                                char_ends = alignment.get("character_end_times_seconds", [])

                                curr_word: list[str] = []
                                curr_start: float | None = None
                                curr_end: float | None = None

                                for ch, st, en in zip(chars, char_starts, char_ends):
                                    if ch.isspace():
                                        if curr_word and curr_start is not None and curr_end is not None:
                                            words.append("".join(curr_word))
                                            word_starts.append(curr_start)
                                            word_ends.append(curr_end)
                                            curr_word = []
                                            curr_start = None
                                            curr_end = None
                                    else:
                                        if curr_start is None:
                                            curr_start = st
                                        curr_end = en
                                        curr_word.append(ch)

                                if curr_word and curr_start is not None and curr_end is not None:
                                    words.append("".join(curr_word))
                                    word_starts.append(curr_start)
                                    word_ends.append(curr_end)

                                yield {
                                    "audio": audio_b64,
                                    "alignment": {
                                        "words": words,
                                        "word_start_times_seconds": word_starts,
                                        "word_end_times_seconds": word_ends,
                                    },
                                }
                            except Exception:
                                continue
        except Exception as e:
            if isinstance(e, (ProviderConfigurationError, ValueError)):
                raise
            raise ValueError(f"ElevenLabs stream with timestamps failed: {e}") from e


def get_tts_provider(provider_type: str | None = None) -> BaseTextToSpeechProvider:
    """Factory resolving TTS provider with privacy mode validation."""
    privacy_mode = settings.PRIVACY_MODE
    req_type = (provider_type or getattr(settings, "TTS_PROVIDER", None) or "edge-tts").lower().strip()

    if req_type in ("cloud", "elevenlabs", "openai", "azure", "aws-polly", "google"):
        if privacy_mode in ("strict-local", "private-machine"):
            raise PrivacyViolationError(
                f"Hosted cloud TTS provider '{req_type}' is prohibited under {privacy_mode} privacy mode."
            )

    if req_type == "elevenlabs" or (req_type == "cloud" and getattr(settings, "ELEVENLABS_API_KEY", None)):
        return ElevenLabsTTSProvider()

    if req_type in ("edge-tts", "edgetts", "neural", "cloud"):
        return EdgeTTSProvider(default_voice=getattr(settings, "TTS_VOICE", "en-US-AriaNeural"))
    if req_type == "piper":
        return PiperTTSProvider(voice_model=getattr(settings, "TTS_VOICE", "en_US-lessac-medium"))
    if req_type == "system":
        return SystemTTSProvider()

    return MockTextToSpeechProvider()