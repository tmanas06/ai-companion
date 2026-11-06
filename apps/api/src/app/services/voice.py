"""Voice orchestration service connecting STT, Companion Context, Memory RAG, LLM, and TTS."""

import base64
from typing import Optional, Annotated
from uuid import UUID
from fastapi import BackgroundTasks, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Companion, Conversation
from app.providers.stt import BaseSpeechToTextProvider, get_stt_provider
from app.providers.tts import BaseTextToSpeechProvider, get_tts_provider
from app.schemas.conversation import ChatRequest, ConversationCreate, MessageCreate
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

        # 5. Synthesize TTS audio for companion's reply
        voice_target = voice or companion.name
        audio_data = await self.synthesize_speech(assistant_msg.content, voice=voice_target)
        audio_b64 = base64.b64encode(audio_data).decode("ascii") if audio_data else None

        provider_type = getattr(self.tts_provider, "provider_type", "mock")
        audio_format = "audio/mpeg" if provider_type == "edge-tts" else "audio/wav"

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

        # 5. Synthesize TTS audio for companion's greeting
        voice_target = voice or companion.name
        audio_data = await self.synthesize_speech(greeting_text, voice=voice_target)
        audio_b64 = base64.b64encode(audio_data).decode("ascii") if audio_data else None

        provider_type = getattr(self.tts_provider, "provider_type", "mock")
        audio_format = "audio/mpeg" if provider_type == "edge-tts" else "audio/wav"

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
        )



async def get_voice_service(
    session: Annotated[AsyncSession, Depends(get_db)],
    conversation_service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> VoiceService:
    """Dependency injection factory for VoiceService."""
    return VoiceService(session, conversation_service)
