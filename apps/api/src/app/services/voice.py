"""Voice orchestration service connecting STT, Companion Context, Memory RAG, LLM, and TTS."""

import base64
from typing import Optional, Annotated
from uuid import UUID
from fastapi import BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Companion
from app.providers.stt import BaseSpeechToTextProvider, get_stt_provider
from app.providers.tts import BaseTextToSpeechProvider, get_tts_provider
from app.schemas.conversation import ChatRequest, ConversationCreate
from app.schemas.voice import VoiceTurnResponse
from app.services.conversation import ConversationService, get_conversation_service


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
        if audio_bytes and len(audio_bytes) > 0:
            transcript = await self.transcribe_audio(audio_bytes, filename=filename)
        elif text and text.strip():
            transcript = text.strip()
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
        )

        conv_res, user_msg, assistant_msg = await self.conversation_service.chat(
            user_id,
            chat_req,
            background_tasks=background_tasks,
        )

        # 5. Synthesize TTS audio for companion's reply
        audio_wav = await self.synthesize_speech(assistant_msg.content, voice=voice)
        audio_b64 = base64.b64encode(audio_wav).decode("ascii") if audio_wav else None

        return VoiceTurnResponse(
            conversation_id=conv_res.id,
            user_message_id=user_msg.id,
            assistant_message_id=assistant_msg.id,
            transcript=transcript,
            reply_text=assistant_msg.content,
            companion_id=companion.id,
            companion_name=companion.name,
            audio_base64=audio_b64,
            audio_format="audio/wav",
            tts_provider=getattr(self.tts_provider, "provider_type", "mock"),
            model=assistant_msg.model or "ollama",
        )


async def get_voice_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    conversation_service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> VoiceService:
    """Dependency injection factory for VoiceService."""
    return VoiceService(session, conversation_service)
