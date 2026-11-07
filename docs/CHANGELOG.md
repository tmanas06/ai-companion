# AETHRA Changelog

Recent work since the `master` baseline (last commit: `556bc33 mac updates 2 major`).

---

## Backend fixes

- **`conversation.py` NameError in streaming path.** The streaming blockchain
  branch referenced `is_voice` before it was defined. Fixed by assigning
  `is_voice = getattr(request, 'voice_mode', False)` at the top of
  `stream_chat`. Previously would NameError on every streamed blockchain
  message.
- **`is_blockchain_request()` false positives.** Replaced the substring
  keyword scan (matched "send", "address", "token" in ordinary chat) with a
  word-boundary regex and a tighter vocabulary. Also added a fast path for
  bare `0x…` EVM addresses. See `apps/api/src/app/services/blockchain.py`.
- **`OG_VOICE_MODEL` was invisible.** The 0G provider's
  `get_available_models()` only returned `OG_DEFAULT_MODEL`, so voice-mode
  blockchain requests requested a model the provider didn't advertise. Now
  both IDs are returned when `OG_VOICE_MODEL` is set.

## Brand rename: AI Companion → AETHRA

User-facing surfaces renamed, internal package names and third-party CC0
license strings left alone:

- Web: `layout.tsx` metadata, sidebar/mobile-header, auth pages, onboarding,
  `icon.svg` (new violet→cyan gradient "A" monogram)
- Mobile: `app.config.js`, tab-home header, Settings "About",
  `android/settings.gradle`, `android/app/src/main/res/values/strings.xml`
- `README.md` title

Untouched (deliberately): `@ai-companion/*` package names, iOS/Android
bundle IDs, Expo slug (changing them invalidates store identity + push
tokens), `avatar-video-manifest.ts` CC0 attribution strings.

## Milestone 1 — Mobile APK foundation

Problem: the mobile APK had `localStorage` calls that are no-ops in RN, a
silent fake-reply fallback hiding real AI errors, no persisted backend URL
config, and no EAS build profile.

Shipped:

- `apps/mobile/src/services/server-config.ts` — persisted LAN URL in
  SecureStore, survives app restart.
- `apps/mobile/src/services/ai-status.ts` — `/api/v1/health` probe with
  `useAiStatus()` hook, auto-polls (5 min online, 15 s offline).
- `apps/mobile/src/components/AiStatusBanner.tsx` — red banner with Retry
  when the LAN backend is unreachable.
- Chat screen: removed two `localStorage` calls that would silently fail in
  RN; removed silent fake-reply fallback; real errors now surface as
  `[AI unavailable] <reason>` with a status refresh.
- Settings: LAN URL field persists properly; new **Test Connection** button
  shows latency or the real error (not a fake fallback).
- `apps/mobile/eas.json` — `preview` profile builds APK, `production`
  builds AAB.
- `apps/mobile/package.json` — new scripts: `build:apk`, `build:apk:local`,
  `build:aab`.
- `apps/mobile/.env.example` — optional `EXPO_PUBLIC_API_URL` default.

## Milestone 2 — On-device hybrid AI (chat + embeddings + RAG)

The AI itself moves onto the phone. The APK is no longer a thin client.

- **llama.rn integration** via dynamic require so the JS build succeeds even
  before the native rebuild. See `apps/mobile/src/engine/local-llm.ts`.
- **Model catalog** (`apps/mobile/src/engine/model-catalog.ts`): Qwen2.5-3B
  (default), Phi-3-mini, Gemma-2-2B. All Q4_K_M GGUF from Hugging Face.
- **Resumable downloads** via `expo-file-system` with progress + cancel +
  verify + delete. Stored under
  `<FileSystem.documentDirectory>aethra-models/`.
- **`routeMessage(message)`** (`src/engine/ai-router.ts`) replaces the
  single `fetchWithAuth` call. Dispatches to local or LAN based on the user's
  AI source preference (`on-device` / `lan` / `auto`).
- **On-device RAG**: Nomic Embed Text v1.5 Q4 (90 MB) runs in a separate
  llama.rn context with `embedding: true`. SQLite vector store
  (`aethra.db`) stores memories as float32 BLOBs; cosine similarity in JS.
- Fire-and-forget write-back after every reply so later turns can retrieve
  context.
- **Settings UI** — AI source chips (Auto / On-device / Laptop), per-model
  Download / Cancel / Delete, live progress %, kind-aware model selection
  (chat vs embedding stored under separate preference keys).
- **Fail-soft everywhere**: no embedding model → empty context, chat still
  works. No native runtime → clear error banner, chat routes to LAN.

## Milestone 3 — Voice input + memory editor

Push-to-talk actually works offline.

- **whisper.rn integration** in `apps/mobile/src/engine/local-stt.ts`.
  Singleton context; `startRecording()` returns a session handle;
  `stopAndTranscribe()` records 16 kHz mono WAV via `expo-av`, transcribes
  locally, deletes the temp file.
- **Whisper Tiny.en** (32 MB) and **Base.en** (57 MB) in the catalog.
- **Chat mic button** — real recording, replaces the previous hardcoded
  "Hello Aria, tell me something interesting" simulation. Mic label shows
  `…` while transcribing. Unmount cancels in-flight recordings. Clear error
  messages when runtime / model / mic permission is missing.
- **Memories tab** (`apps/mobile/app/(tabs)/memories.tsx`) — list view of
  the SQLite store with per-row delete, pull-to-refresh, timestamps, type
  chips. Uses new `listMemories()` in `memory-store.ts`.
- `ModelRow` component extracted — cleaner than three duplicated JSX blocks
  for chat/embedding/STT rows in Settings.

## Milestone 4 — Smart routing + device gating + multilingual + diagnostics

- **`analyzeIntent(message)`** (`src/engine/intent.ts`) — pure regex rules:
  - blockchain keywords → `force-lan`
  - > 400 chars / ≥ 3 question marks / code-looking → `prefer-lan`
  - ≤ 30 words and short → `prefer-local`
  - else → `neutral`
- Router's Auto mode now consults these hints and falls back cleanly.
- **`expo-device`** dep added. `src/engine/device-caps.ts` exposes
  `getDeviceRamMb()`, `checkModelFit(entry)` → `ok | tight | too-big |
  unknown`, and `recommendModelId(kind)` for picking the largest model that
  fits with 40% headroom.
- Chat model rows in Settings now show `⚠ may not fit` / `⚠ tight fit`
  warnings based on RAM.
- **Whisper Base Multilingual** (57 MB) and **Small Multilingual** (190 MB)
  added. STT wrapper passes `language: 'auto'` for multilingual models.
- **Diagnostics card** in Settings — `Run on-device benchmark` button
  reports embedding latency, chat throughput (words/sec), llama.rn /
  whisper.rn install status, and device RAM.

## Thinking fillers (ChatGPT-style)

- `apps/mobile/src/engine/filler-replies.ts` — 4 category pools (thinking,
  acknowledgment, interesting, complex) with 4-6 phrases each.
- `categorize(message)` picks a pool based on message shape: >300 chars →
  complex; starts with "tell/show/explain/write…" → acknowledgment;
  has "?" and >20 chars → interesting; else thinking.
- Chat screen schedules a filler bubble 400 ms after send; replaces it
  with the real reply when ready. Canned / sub-400 ms replies never show
  one. Interrupts and errors clear the filler cleanly.
- Filler bubbles render italic + muted so they're visually distinct from
  real answers.
- **Audible fillers via `expo-speech`.** When the filler bubble appears,
  the companion also *says* it out loud using system TTS (offline,
  instant, no server call). `Speech.stop()` is called before the real
  reply plays, on interrupt, and on unmount so fillers never overlap
  with the real answer.

## Canned replies for pleasantries

- `apps/mobile/src/engine/canned-replies.ts` — 11 pattern categories with
  2-4 reply variants each (greeting, how_are_you, reply_good, thanks,
  farewell, identity, capabilities, apology, laugh, yes, no). Replies are
  picked randomly for variety.
- Short-circuits `routeMessage` **before** intent analysis or any model
  call: "hi" answers in ~0 ms with brand-consistent copy.
- Whole-message regex anchors (`/^…$/`) + 40-char cap prevent interception
  of real queries like "yo check my wallet".
- Canned exchanges are still written to memory so later turns see context.
- Exported `CANNED` array — extend with your own patterns, no build needed.

---

## Files changed vs master

New files:

```
docs/MOBILE.md
docs/CHANGELOG.md
apps/api/src/app/api/v1/endpoints/blockchain.py
apps/api/src/app/providers/og_provider.py
apps/api/src/app/services/blockchain.py
apps/mobile/eas.json
apps/mobile/.env.example
apps/mobile/app/(tabs)/memories.tsx
apps/mobile/src/components/AiStatusBanner.tsx
apps/mobile/src/engine/
  ├── ai-router.ts
  ├── canned-replies.ts
  ├── device-caps.ts
  ├── diagnostics.ts
  ├── intent.ts
  ├── local-embeddings.ts
  ├── local-llm.ts
  ├── local-stt.ts
  ├── memory-service.ts
  ├── memory-store.ts
  ├── model-catalog.ts
  └── model-manager.ts
apps/mobile/src/services/
  ├── ai-status.ts
  ├── preferences.ts
  └── server-config.ts
apps/web/src/app/icon.svg  (overwritten with AETHRA mark)
```

Modified:

```
README.md
.env.example                           (new OG_* vars)
apps/api/src/app/api/v1/router.py      (blockchain router registered)
apps/api/src/app/core/config.py        (OG_* settings)
apps/api/src/app/providers/__init__.py (ZERO_G enum + exports)
apps/api/src/app/providers/factory.py  (0g provider registered + dispatched)
apps/api/src/app/providers/privacy.py  (0g treated as hosted-cloud)
apps/api/src/app/services/conversation.py  (blockchain routing + is_voice fix)
apps/mobile/package.json               (llama.rn, whisper.rn, expo-sqlite, expo-device, build scripts)
apps/mobile/app/_layout.tsx            (bootstraps persisted server URL)
apps/mobile/app/(tabs)/_layout.tsx     (adds Memories tab)
apps/mobile/app/(tabs)/chat.tsx        (routeMessage, real mic, AiStatusBanner)
apps/mobile/app/(tabs)/settings.tsx    (model manager, diagnostics, memory controls)
apps/mobile/app/(tabs)/index.tsx       (AETHRA title)
apps/mobile/app.config.js              (AETHRA name)
apps/mobile/android/settings.gradle    (AETHRA rootProject.name)
apps/mobile/android/.../strings.xml    (AETHRA app_name)
apps/mobile/src/services/api-client.ts (bootstrapApiBaseUrl, persistApiBaseUrl)
apps/web/src/app/layout.tsx            (AETHRA metadata)
apps/web/src/components/AppLayout.tsx  (AETHRA + new logo mark)
apps/web/src/app/(auth)/{login,register}/page.tsx
apps/web/src/app/(app)/onboarding/companion/page.tsx
apps/web/src/lib/api-client.ts
```

## Known gaps

- Mobile TTS still routes through the LAN voice endpoint. On-device TTS
  (`expo-speech`) would complete the offline voice loop. (M5 candidate.)
- Memory distillation (summarize turns into salient facts) is deferred —
  current pipeline stores raw turns, which means noise in retrievals at
  scale.
- `companionId` column exists in the memory store but isn't populated, so
  switching companions doesn't filter memories yet.
- Streaming local LLM output (token-by-token to UI) is not wired.
- The canned-reply list is English-only.
