"""Voice endpoints for Speech-to-Text, Text-to-Speech, and conversational voice turns."""

from typing import Optional
from uuid import UUID
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)

from app.core.security import get_current_user
from app.models import User
from app.schemas.voice import (
    GreetingRequest,
    SynthesizeRequest,
    TranscribeResponse,
    VoiceTurnRequest,
    VoiceTurnResponse,
)
from app.services.voice import VoiceService, get_voice_service

router = APIRouter(tags=["voice"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    service: VoiceService = Depends(get_voice_service),
):
    """Transcribe microphone audio into text using local STT."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty",
        )

    try:
        text = await service.transcribe_audio(audio_bytes, filename=file.filename)
        return TranscribeResponse(text=text)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech transcription failed: {e}",
        )


@router.post("/synthesize")
async def synthesize(
    request: SynthesizeRequest,
    current_user: User = Depends(get_current_user),
    service: VoiceService = Depends(get_voice_service),
):
    """Synthesize text into WAV speech audio using local TTS."""
    try:
        audio_bytes = await service.synthesize_speech(
            text=request.text,
            voice=request.voice,
            speed=request.speed or 1.0,
        )
        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": 'inline; filename="speech.wav"',
                "Cache-Control": "no-cache",
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {e}",
        )


@router.post("/turn", response_model=VoiceTurnResponse)
async def voice_turn(
    background_tasks: BackgroundTasks,
    companion_id: UUID = Form(...),
    conversation_id: Optional[UUID] = Form(None),
    text: Optional[str] = Form(None),
    voice: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    service: VoiceService = Depends(get_voice_service),
):
    """Execute a complete voice turn: STT -> RAG Context -> Local LLM -> Persistence -> TTS."""
    audio_bytes = None
    filename = None
    if audio_file:
        audio_bytes = await audio_file.read()
        filename = audio_file.filename

    if (not audio_bytes or len(audio_bytes) == 0) and (not text or not text.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either audio_file or text must be provided for a voice turn",
        )

    try:
        return await service.execute_voice_turn(
            user_id=current_user.id,
            companion_id=companion_id,
            conversation_id=conversation_id,
            audio_bytes=audio_bytes,
            text=text,
            voice=voice,
            filename=filename,
            background_tasks=background_tasks,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice turn processing failed: {e}",
        )


@router.post("/turn-json", response_model=VoiceTurnResponse)
async def voice_turn_json(
    request: VoiceTurnRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: VoiceService = Depends(get_voice_service),
):
    """JSON variant of voice turn when client handles audio capture or sends text query."""
    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text content is required for JSON voice turn",
        )

    try:
        return await service.execute_voice_turn(
            user_id=current_user.id,
            companion_id=request.companion_id,
            conversation_id=request.conversation_id,
            audio_bytes=None,
            text=request.text,
            voice=request.voice,
            background_tasks=background_tasks,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice turn processing failed: {e}",
        )


@router.post("/greeting", response_model=VoiceTurnResponse)
async def voice_greeting(
    request: GreetingRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: VoiceService = Depends(get_voice_service),
):
    """Trigger companion's proactive in-character opening greeting before user speaks."""
    try:
        return await service.execute_greeting(
            user_id=current_user.id,
            companion_id=request.companion_id,
            conversation_id=request.conversation_id,
            voice=request.voice,
            background_tasks=background_tasks,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Greeting failed: {e}",
        )

