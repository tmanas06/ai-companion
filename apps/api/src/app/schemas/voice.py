from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class TranscribeResponse(BaseModel):
    text: str = Field(..., description="Transcribed speech text")
    language: Optional[str] = Field("en", description="Detected or specified audio language")
    duration_seconds: Optional[float] = Field(None, description="Audio duration in seconds")


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000, description="Text to synthesize to speech")
    voice: Optional[str] = Field(None, description="Voice identifier")
    speed: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Speech rate multiplier")


class VoiceTurnRequest(BaseModel):
    companion_id: UUID = Field(..., description="Target companion ID")
    conversation_id: Optional[UUID] = Field(None, description="Existing conversation ID if continuing")
    text: Optional[str] = Field(None, description="Transcribed user text if client-side STT used")
    voice: Optional[str] = Field(None, description="Requested TTS voice name")


class GreetingRequest(BaseModel):
    companion_id: UUID = Field(..., description="Target companion ID")
    conversation_id: Optional[UUID] = Field(None, description="Existing conversation ID if continuing")
    voice: Optional[str] = Field(None, description="Requested TTS voice name")


class VoiceTurnResponse(BaseModel):
    conversation_id: UUID
    user_message_id: Optional[UUID] = None
    assistant_message_id: UUID
    transcript: str
    reply_text: str
    companion_id: UUID
    companion_name: str
    audio_base64: Optional[str] = None
    audio_format: str = "audio/wav"
    tts_provider: Optional[str] = "mock"
    model: str
    emotion: Optional[str] = "neutral"
    emotion_intensity: Optional[float] = 0.5

