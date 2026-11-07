"""Voice orchestration service connecting STT, Companion Context, Memory RAG, LLM, and TTS."""

import base64
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, Optional
from uuid import UUID, uuid4
from fastapi import BackgroundTasks, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models import Companion, Conversation
from app.providers.stt import BaseSpeechToTextProvider, get_stt_provider
from app.providers.tts import BaseTextToSpeechProvider, get_tts_provider
from app.schemas.conversation import ChatRequest, ConversationCreate, MessageCreate
from app.schemas.voice import VoiceTurnResponse
from app.services.conversation import ConversationService, get_conversation_service
from app.services.emotion import analyze_conversational_emotion


@dataclass
class TTSTiming:
    """Privacy-safe timing measurements for a TTS stream.

    Contains no conversation content, transcripts, or user data. All values
    are derived from monotonic clocks and are suitable for metrics emission.
    """

    turn_id: str
    request_start_ms: float = 0.0
    first_byte_ms: Optional[float] = None
    last_chunk_ms: Optional[float] = None
    total_chunks: int = 0
    total_bytes: int = 0
    cancelled: bool = False
    error: Optional[str] = None

    @property
    def time_to_first_byte_ms(self) -> Optional[float]:
        if self.first_byte_ms is not None and self.request_start_ms > 0:
            return self.first_byte_ms - self.request_start_ms
        return None

    @property
    def total_duration_ms(self) -> Optional[float]:
        if self.last_chunk_ms is not None and self.request_start_ms > 0:
            return self.last_chunk_ms - self.request_start_ms
        return None


def infer_companion_gender(companion_name: str, personality: Optional[dict] = None) -> str:
    """Infer companion gender from personality or name."""
    if personality and isinstance(personality, dict):
        g = str(personality.get("gender", "")).lower()
        if g in ("male", "female"):
            return g
    name = (companion_name or "").lower().strip()
    male_names = {
        "marcus", "kai", "atlas", "alex", "david", "john", "michael",
        "jack", "leo", "max", "daniel", "lucas", "ethan", "oliver",
        "noah", "liam", "arthur", "sam", "will", "charlie", "george", "adam"
    }
    return "male" if name in male_names else "female"


def resolve_gender_appropriate_voice(
    requested_voice: Optional[str],
    companion_name: str,
    gender: str,
    provider_type: str = "edge-tts",
) -> str:
    """Enforce that male companions strictly receive masculine voices and female companions receive feminine voices."""
    req = (requested_voice or "").strip().lower()
    name_clean = (companion_name or "").strip().lower()

    # ElevenLabs IDs & keywords
    female_markers = {
        "21m00tcm4tlvdq8ikwam", "exavitqu4vr4xnsdxmal", "xb0fdunxu5powfxdhcwa",
        "pfzp5jqg7iqjiquc4bku", "cgsgspj2msm6clmckdw9", "rachel", "sarah",
        "charlotte", "lily", "jessica", "jenny", "ava", "aria", "michelle",
        "clara", "sonia", "luna", "nova", "sage", "maya", "female", "woman",
        "en-us-jennyneural", "en-us-arianeural", "en-us-avaneural",
        "en-us-michelleneural", "en-ca-claraneural", "en-gb-sonianeural",
    }
    male_markers = {
        "pninz6obpgdqgcfmajgb", "jbfqncbsd6rmkjvdrzzb", "tx3lpaxmhkxfdv7voqhj",
        "bihbv24mwmergaszh58o", "ikne3meq5asn9xlyudcd", "adam", "george",
        "liam", "will", "charlie", "marcus", "atlas", "kai", "guy", "david",
        "christopher", "andrew", "brian", "ryan", "male", "man",
        "en-us-guyneural", "en-us-christopherneural", "en-us-andrewneural",
        "en-us-brianneural", "en-gb-ryanneural",
    }

    if gender == "male":
        # Check if requested voice is invalid or explicitly female
        is_female = any(m == req or m in req for m in female_markers)
        if not req or is_female:
            # Override with character's signature male voice
            if provider_type == "elevenlabs":
                signature_map = {
                    "marcus": "pNInz6obpgDQGcFmaJgB",  # Adam
                    "atlas": "JBFqnCBsd6RMkjVDRZzb",   # George
                    "kai": "TX3LPaxmHKxFdv7VOQHJ",     # Liam
                }
                return signature_map.get(name_clean, "pNInz6obpgDQGcFmaJgB")
            else:
                signature_map = {
                    "marcus": "en-US-GuyNeural",
                    "atlas": "en-US-ChristopherNeural",
                    "kai": "en-US-AndrewNeural",
                }
                return signature_map.get(name_clean, "en-US-GuyNeural")
        return requested_voice or "en-US-GuyNeural"
    else:
        # Female companion: check if requested voice is invalid or explicitly male
        is_male = any(m == req or m in req for m in male_markers)
        if not req or is_male:
            # Override with character's signature female voice
            if provider_type == "elevenlabs":
                signature_map = {
                    "aria": "21m00Tcm4TlvDq8ikWAM",    # Rachel
                    "luna": "EXAVITQu4vr4xnSDxMaL",    # Sarah
                    "nova": "XB0fDUnXU5powFXDhCwa",    # Charlotte
                    "sage": "pFZP5JQG7iQjIQuC4Bku",    # Lily
                    "maya": "cgSgspJ2msm6clMCkdW9",    # Jessica
                }
                return signature_map.get(name_clean, "21m00Tcm4TlvDq8ikWAM")
            else:
                signature_map = {
                    "aria": "en-US-JennyNeural",
                    "luna": "en-US-AvaNeural",
                    "nova": "en-US-AriaNeural",
                    "sage": "en-US-MichelleNeural",
                    "maya": "en-CA-ClaraNeural",
                }
                return signature_map.get(name_clean, "en-US-JennyNeural")
        return requested_voice or "en-US-JennyNeural"


class VoiceService:
    """Orchestrates voice interaction lifecycle: STT -> Context + RAG -> Local LLM -> TTS."""

    def __init__(
        self,
        session: AsyncSession,
        conversation_service: ConversationService,
        stt_provider: Optional[BaseSpeechToTextProvider] = None,
        tts_provider: Optional[BaseTextToSpeechProvider] = None,
    ):
        self.session = session
        self.conversation_service = conversation_service
        self.stt_provider = stt_provider or get_stt_provider()
        self.tts_provider = tts_provider or get_tts_provider()

    async def transcribe_audio(self, audio_bytes: bytes, filename: Optional[str] = None) -> str:
        """Transcribe speech audio with the configured local STT provider."""
        if not audio_bytes or len(audio_bytes) == 0:
            raise ValueError("Audio data is empty")

        text = await self.stt_provider.transcribe(audio_bytes, filename=filename)
        clean_text = text.strip()
        if not clean_text:
            raise ValueError("No speech detected in audio")
        return clean_text

    async def synthesize_speech(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: float = 1.0,
    ) -> bytes:
        """Synthesize text into WAV speech audio using configured local TTS provider."""
        if not text or not text.strip():
            return b""
        return await self.tts_provider.synthesize(text.strip(), voice=voice, speed=speed)

    async def stream_synthesize_speech(
        self,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        turn_id: str | None = None,
    ) -> AsyncIterator[tuple[bytes, TTSTiming]]:
        """Stream synthesized speech audio chunks incrementally.

        Yields (audio_chunk, timing) tuples. The timing object is updated
        in-place as chunks are produced, so callers can observe progress.

        Raises:
            NotImplementedError: If the underlying TTS provider does not
                support streaming synthesis.
            ValueError: If synthesis fails.
        """
        if not text or not text.strip():
            return

        timing = TTSTiming(
            turn_id=turn_id or str(uuid4()),
            request_start_ms=time.monotonic() * 1000.0,
        )

        try:
            chunk_index = 0
            async for chunk in self.tts_provider.stream_synthesize(
                text.strip(), voice=voice, speed=speed
            ):
                if not chunk:
                    continue
                chunk_index += 1
                timing.total_chunks = chunk_index
                timing.total_bytes += len(chunk)
                now_ms = time.monotonic() * 1000.0
                if timing.first_byte_ms is None:
                    timing.first_byte_ms = now_ms
                timing.last_chunk_ms = now_ms
                yield chunk, timing
        except NotImplementedError:
            raise
        except Exception as e:
            timing.error = str(e)
            raise ValueError(f"TTS streaming failed: {e}") from e

    async def stream_synthesize_speech_with_timestamps(
        self,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        turn_id: str | None = None,
    ) -> AsyncIterator[tuple[dict, TTSTiming]]:
        """Stream synthesized speech audio chunks with word-level alignment timestamps.

        Yields (chunk_dict, timing) tuples where chunk_dict contains:
        - "audio": base64 encoded audio chunk
        - "alignment": word-level timing data

        Raises:
            NotImplementedError: If the underlying TTS provider does not
                support streaming synthesis with timestamps.
            ValueError: If synthesis fails.
        """
        if not text or not text.strip():
            return

        timing = TTSTiming(
            turn_id=turn_id or str(uuid4()),
            request_start_ms=time.monotonic() * 1000.0,
        )

        try:
            chunk_index = 0
            async for chunk in self.tts_provider.stream_with_timestamps(
                text.strip(), voice=voice, speed=speed
            ):
                if not chunk:
                    continue
                chunk_index += 1
                timing.total_chunks = chunk_index
                # chunk["audio"] is base64, decode to get byte length
                timing.total_bytes += len(base64.b64decode(chunk["audio"]))
                now_ms = time.monotonic() * 1000.0
                if timing.first_byte_ms is None:
                    timing.first_byte_ms = now_ms
                timing.last_chunk_ms = now_ms
                yield chunk, timing
        except NotImplementedError:
            raise
        except Exception as e:
            timing.error = str(e)
            raise ValueError(f"TTS streaming with timestamps failed: {e}") from e

    async def execute_voice_turn(
        self,
        user_id: UUID,
        companion_id: UUID,
        conversation_id: Optional[UUID] = None,
        audio_bytes: Optional[bytes] = None,
        text: Optional[str] = None,
        voice: Optional[str] = None,
        filename: Optional[str] = None,
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> VoiceTurnResponse:
        """Execute a complete, privacy-preserving voice turn."""
        # 1. Authorize companion ownership and active state
        query = select(Companion).where(
            Companion.id == companion_id,
            Companion.user_id == user_id,
        )
        res = await self.session.execute(query)
        companion = res.scalar_one_or_none()

        if not companion:
            raise ValueError(f"Companion '{companion_id}' not found for user")
        if not companion.is_active:
            raise ValueError(f"Companion '{companion.name}' is inactive")

        # 2. Resolve transcript
        # Prefer client-provided explicit text transcript if provided, otherwise transcribe audio
        if text and text.strip():
            transcript = text.strip()
        elif audio_bytes and len(audio_bytes) > 0:
            transcript = await self.transcribe_audio(audio_bytes, filename=filename)
        else:
            raise ValueError("Neither audio nor text provided for voice turn")

        # 3. Resolve or create active conversation
        if conversation_id:
            conv = await self.conversation_service.get_conversation(user_id, conversation_id)
            if not conv:
                raise ValueError(f"Conversation '{conversation_id}' not found")
        else:
            conv = await self.conversation_service.create_conversation(
                user_id,
                ConversationCreate(
                    companion_id=companion.id,
                    title=f"Voice with {companion.name}",
                ),
            )

        # 4. Generate AI response via existing conversation service
        # This handles:
        # - Memory RAG retrieval (approved, non-sensitive memories only)
        # - Companion persona system prompt injection
        # - Ollama local LLM execution
        # - Internal reasoning removal (<think> tags stripped)
        # - Atomic persistence of user and assistant messages
        # - Memory candidate extraction background tasks
        chat_req = ChatRequest(
            conversation_id=conv.id,
            message=transcript,
            stream=False,
            voice_mode=True,
        )

        conv_res, user_msg, assistant_msg = await self.conversation_service.chat(
            user_id,
            chat_req,
            background_tasks=background_tasks,
        )

        # 5. Synthesize TTS audio for companion's reply with gender enforcement.
        # TTS is intentionally non-fatal: an intermittent external TTS failure
        # must not kill the whole voice turn. The text reply is always returned.
        provider_type = getattr(self.tts_provider, "provider_type", "mock")
        companion_gender = infer_companion_gender(companion.name, getattr(companion, "personality", None))
        voice_target = resolve_gender_appropriate_voice(
            requested_voice=voice,
            companion_name=companion.name,
            gender=companion_gender,
            provider_type=provider_type,
        )
        audio_data: Optional[bytes] = None
        try:
            audio_data = await self.synthesize_speech(assistant_msg.content, voice=voice_target)
        except Exception:
            audio_data = None
        audio_b64 = base64.b64encode(audio_data).decode("ascii") if audio_data else None

        audio_format = "audio/mpeg" if provider_type in ("edge-tts", "elevenlabs") else "audio/wav"

        # 6. Analyze conversational emotion for photorealistic video avatar expression
        emotion, emotion_intensity = analyze_conversational_emotion(transcript, assistant_msg.content)

        # 7. Optionally trigger background SadTalker lip-sync video generation if enabled
        sadtalker_job_id: Optional[str] = None
        if settings.SADTALKER_ENABLED and audio_data:
            try:
                from app.services.sadtalker import get_sadtalker_service
                sadtalker_svc = get_sadtalker_service()
                if sadtalker_svc.get_service_status().available:
                    job = await sadtalker_svc.submit_job(
                        audio_bytes=audio_data,
                        portrait_id=companion.name.lower(),
                        emotion=emotion,
                    )
                    sadtalker_job_id = job.job_id
            except Exception:
                # Non-blocking: continue seamlessly with existing video loops
                pass

        return VoiceTurnResponse(
            conversation_id=conv_res.id,
            user_message_id=user_msg.id,
            assistant_message_id=assistant_msg.id,
            transcript=transcript,
            reply_text=assistant_msg.content,
            companion_id=companion.id,
            companion_name=companion.name,
            audio_base64=audio_b64,
            audio_format=audio_format,
            tts_provider=provider_type,
            model=assistant_msg.model or "ollama",
            emotion=emotion,
            emotion_intensity=emotion_intensity,
            sadtalker_job_id=sadtalker_job_id,
        )


    async def execute_greeting(
        self,
        user_id: UUID,
        companion_id: UUID,
        conversation_id: Optional[UUID] = None,
        voice: Optional[str] = None,
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> VoiceTurnResponse:
        """Generate and synthesize an in-character opening greeting from the companion before user speaks."""
        # 1. Authorize companion ownership and active state
        query = select(Companion).where(
            Companion.id == companion_id,
            Companion.user_id == user_id,
        )
        res = await self.session.execute(query)
        companion = res.scalar_one_or_none()

        if not companion:
            raise ValueError(f"Companion '{companion_id}' not found for user")
        if not companion.is_active:
            raise ValueError(f"Companion '{companion.name}' is inactive")

        # 2. Resolve or create active conversation
        if conversation_id:
            conv = await self.conversation_service.get_conversation(user_id, conversation_id)
            if not conv:
                raise ValueError(f"Conversation '{conversation_id}' not found")
        else:
            # Check if there is an existing recent conversation for this companion
            conv_query = (
                select(Conversation)
                .where(
                    Conversation.user_id == user_id,
                    Conversation.companion_id == companion.id,
                    Conversation.deleted_at.is_(None),
                )
                .order_by(desc(Conversation.updated_at))
                .limit(1)
            )
            conv_res = await self.session.execute(conv_query)
            conv = conv_res.scalar_one_or_none()
            if not conv:
                conv = await self.conversation_service.create_conversation(
                    user_id,
                    ConversationCreate(
                        companion_id=companion.id,
                        title=f"Chat with {companion.name}",
                    ),
                )

        # 3. Check existing messages in this conversation
        recent_messages = await self.conversation_service.get_recent_messages(conv.id, limit=5)

        # In-character archetype greetings
        archetype_greetings = {
            "aria": "Hello! It's so wonderful to see you. How are you feeling today?",
            "marcus": "Hello. Great to connect with you. What would you like to focus on today?",
            "luna": "Hey there! I'm so excited to chat with you today. What's on your mind?",
            "kai": "Hey! Awesome to meet you. What exciting things are going on today?",
            "nova": "Greetings! It's fantastic to connect. What big ideas are we exploring today?",
            "atlas": "Welcome! I'm glad you're here. Let me know what you'd like to work on together.",
            "sage": "Hello. It's peaceful to be here with you. Take your time, what would you like to reflect on?",
            "maya": "Hi! It's wonderful to meet you. I'm all ears—how can I brighten your day?",
        }

        name_lower = companion.name.lower().strip()
        default_greeting = archetype_greetings.get(
            name_lower,
            f"Hello! I'm {companion.name}. It's so wonderful to meet you. How are you doing today?",
        )

        greeting_text = default_greeting
        if recent_messages:
            # If the user is returning to an existing chat, welcome them back!
            greeting_text = "Welcome back! It's great to see you again. What's on your mind today?"

        # 4. Persist the opening greeting as an assistant message
        assistant_msg = await self.conversation_service.add_message(
            conv.id,
            MessageCreate(
                role="assistant",
                content=greeting_text,
                model="companion-greeting",
                metadata={"is_greeting": True},
            ),
        )

        # 5. Synthesize TTS audio for companion's greeting with gender enforcement
        provider_type = getattr(self.tts_provider, "provider_type", "mock")
        companion_gender = infer_companion_gender(companion.name, getattr(companion, "personality", None))
        voice_target = resolve_gender_appropriate_voice(
            requested_voice=voice,
            companion_name=companion.name,
            gender=companion_gender,
            provider_type=provider_type,
        )
        audio_data = await self.synthesize_speech(greeting_text, voice=voice_target)
        audio_b64 = base64.b64encode(audio_data).decode("ascii") if audio_data else None

        audio_format = "audio/mpeg" if provider_type in ("edge-tts", "elevenlabs") else "audio/wav"

        sadtalker_job_id: Optional[str] = None
        if settings.SADTALKER_ENABLED and audio_data:
            try:
                from app.services.sadtalker import get_sadtalker_service
                sadtalker_svc = get_sadtalker_service()
                if sadtalker_svc.get_service_status().available:
                    job = await sadtalker_svc.submit_job(
                        audio_bytes=audio_data,
                        portrait_id=companion.name.lower(),
                        emotion="happy",
                    )
                    sadtalker_job_id = job.job_id
            except Exception:
                pass

        return VoiceTurnResponse(
            conversation_id=conv.id,
            user_message_id=None,
            assistant_message_id=assistant_msg.id,
            transcript="",
            reply_text=greeting_text,
            companion_id=companion.id,
            companion_name=companion.name,
            audio_base64=audio_b64,
            audio_format=audio_format,
            tts_provider=provider_type,
            model="companion-greeting",
            emotion="happy",
            emotion_intensity=0.8,
            sadtalker_job_id=sadtalker_job_id,
        )




async def get_voice_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    conversation_service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> VoiceService:
    """Dependency injection factory for VoiceService."""
    return VoiceService(session, conversation_service)
