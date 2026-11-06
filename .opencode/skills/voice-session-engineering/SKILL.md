---
name: voice-session-engineering
description: Build responsive, interruptible real-time voice conversations for an AI companion.
---

# Voice Session Engineering

- Define explicit voice-session lifecycle states.
- Support interruption and cancellation of ongoing speech.
- Prevent cancelled responses from playing stale audio.
- Handle microphone permissions, timeouts, network failures, and reconnection.
- Keep privileged provider credentials on the server.
- Use short-lived session credentials where supported.
- Avoid logging secrets or private conversation content unnecessarily.
- Measure time to first audio and interruption latency.
- Test cancellation, reconnection, and concurrent sessions.
- Keep voice-provider integration replaceable.
