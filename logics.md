# AI Companion Voice Flow Logic

This document explains the end-to-end voice conversation flow: from the user speaking in the browser, through the backend STT → RAG → LLM → TTS pipeline, and back to audio playback.

## Overview

```
User speaks (mic) → Frontend VAD detects silence → Audio blob → Next.js proxy
    → FastAPI backend (STT → Conversation/RAG/LLM → TTS) → VoiceTurnResponse
    → Frontend plays assistant audio → Avatar mouth animates → Auto-relisten
```

---

## Frontend Flow

### 1. Microphone capture starts (`useLiveVoiceCompanion.ts:startListening`)

When the user taps the mic (or hands-free mode is on):

- Browser requests mic permission via `navigator.mediaDevices.getUserMedia({ audio: true })`
- An `AudioContext` + `AnalyserNode` is created to monitor audio amplitude every animation frame. This drives:
  - The real-time audio visualizer
  - The avatar mouth-open animation
  - Voice Activity Detection (VAD)
- A `MediaRecorder` records the mic stream into `audioChunksRef` (WebM/WAV blobs)
- Optionally, the Web Speech API (`SpeechRecognition`) starts for live interim transcript
- Frontend state transitions to `'listening'`

### 2. Mic turns off after silence (`monitorAudioLevels`)

Each frame computes a composite speech energy:

1. **Time-domain RMS** — true acoustic amplitude
2. **Frequency-band energy** — speech fundamental bins (100–3000 Hz)
3. **Composite energy** = `max(rms * 2.8, voiceBandAvg * 1.4)`

A noise floor is estimated from the first ~20 frames (~300 ms), and a dynamic speech threshold is set (`max(0.024, noiseFloor * 1.5 + 0.010)`).

- Energy above threshold → `isUserSpeaking = true`
- When energy stays below threshold for **~900–1200 ms** (and at least 350 ms have passed since speech started), the frontend decides the user finished speaking
- It calls `stopListening()` → `mediaRecorder.stop()`, which assembles the recorded chunks into a single `Blob`
- There is also a 12-second safety maximum turn and a 30-second idle timeout

> The exact silence threshold is configured in code (~900 ms Web Speech `onspeechend` fallback, ~1200 ms VAD), not strictly 0.5 s.

### 3. Audio sent to backend (`submitVoiceTurn`)

Builds `multipart/form-data`:

| Field | Source |
|-------|--------|
| `companion_id` | Selected companion UUID |
| `conversation_id` | Existing conversation, or omitted to create one |
| `audio_file` | The recorded mic Blob (`.webm` / `.wav`) |
| `text` | Optional explicit text (used when client handles transcription) |
| `voice` | Optional preferred voice name |

POSTs to Next.js route `/api/voice/turn`.

Frontend state becomes `'generating_response'`.

### 4. Next.js proxy (`apps/web/src/app/api/voice/turn/route.ts`)

- Validates the user's access token (refreshes it automatically on 401)
- Buffers the multipart fields in memory so the stream can be retried
- Forwards to `http://localhost:8000/api/v1/voice/turn` with `Authorization: Bearer <token>`
- Uses a 90-second upstream timeout
- Returns the backend JSON response to the frontend

### 5. Play assistant audio (`playAssistantAudio`)

The backend response includes `audio_base64` (base64-encoded MP3/WAV).

- Decodes base64 into a `data:` URL
- Creates an `HTMLAudioElement`, sets `playbackRate` from voice settings
- On `onplay`: state → `'speaking'`, starts playback amplitude monitoring (avatar mouth animation)
- On `onended`: state → `'idle'`; in hands-free mode, auto-reopens the mic after **450 ms**
- On `onerror`: state → `'idle'`, shows "Unable to play companion audio"

If `audio_base64` is missing (TTS failed), the frontend still shows the text reply and goes to `'idle'` gracefully.

### 6. Interruption (`interrupt`)

If the user taps mic while the companion is speaking:

- Increments `activeSessionIdRef` to invalidate stale responses
- Aborts any pending `fetch`
- Stops playback, cancels browser speech synthesis, stops the recorder
- Cancels any active SadTalker lip-sync job
- State → `'interrupted'` → `'idle'` after 700 ms

---

## Backend Flow (`VoiceService.execute_voice_turn`)

File: `apps/api/src/app/services/voice.py`

| Step | Logic |
|------|-------|
| **1. Authorize** | SQL query: companion must belong to `user_id` and `is_active = true`. Raises `ValueError` otherwise. |
| **2. Resolve transcript** | Uses client-provided `text` if present; otherwise transcribes `audio_bytes` via the local STT provider (`faster-whisper`). Empty audio/text → `ValueError`. |
| **3. Conversation** | Uses existing `conversation_id` or creates a new conversation titled `"Voice with <name>"`. |
| **4. AI response** | `ConversationService.chat()` with `voice_mode=True`: retrieves approved/non-sensitive memories via pgvector similarity, injects companion persona system prompt, calls Ollama local LLM (`qwen2.5:3b`), strips internal `\` reasoning, atomically persists user + assistant messages, and schedules background memory extraction. |
| **5. TTS** | Gender-appropriate voice selection (male companions → male voices, female → female voices). Synthesizes via Edge TTS / Piper / System TTS. **Non-fatal:** if synthesis fails, `audio_data` is `None` and the text reply is still returned. |
| **6. Emotion** | `analyze_conversational_emotion(transcript, reply)` → emotion + intensity for avatar expression. |
| **7. SadTalker** | If `SADTALKER_ENABLED` and audio exists, submits a background lip-sync video job (non-blocking; failures ignored). |

### Response (`VoiceTurnResponse`)

```json
{
  "conversation_id": "...",
  "user_message_id": "...",
  "assistant_message_id": "...",
  "transcript": "user's spoken words",
  "reply_text": "companion's spoken reply",
  "companion_id": "...",
  "companion_name": "Aria",
  "audio_base64": "...base64 MP3...",
  "audio_format": "audio/mpeg",
  "tts_provider": "edge-tts",
  "model": "qwen2.5:3b",
  "emotion": "happy",
  "emotion_intensity": 0.5,
  "sadtalker_job_id": null
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/hooks/useLiveVoiceCompanion.ts` | Frontend mic capture, VAD, silence detection, audio submission, playback, interruption |
| `apps/web/src/app/api/voice/turn/route.ts` | Next.js proxy to backend, auth token handling, retry on 401 |
| `apps/api/src/app/services/voice.py` | Backend voice orchestration (STT → Conversation/RAG → LLM → TTS → emotion → SadTalker) |
| `apps/api/src/app/providers/tts.py` | TTS providers: Edge TTS, Piper, System TTS (espeak) |
| `apps/api/src/app/providers/stt.py` | STT providers: Faster-Whisper, Mock |
| `apps/api/src/app/providers/ollama_provider.py` | Ollama local LLM provider |

---

## Known Fix: TTS no longer kills the voice turn

Previously, TTS synthesis was fatal — an intermittent Edge TTS (network) failure raised an exception that crashed the entire voice turn with HTTP 500 and no reply. The fix in `apps/api/src/app/services/voice.py` wraps TTS in `try/except`, so the text reply is always returned even when audio synthesis fails (`audio_base64` is `null`). Restart the API server for this to take effect.
