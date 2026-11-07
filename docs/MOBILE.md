# AETHRA Mobile

The AETHRA mobile app is an Expo React Native client with a hybrid AI
architecture: it can run inference entirely on-device, fall back to a local
LAN backend (your own laptop running FastAPI), or auto-choose per message.
No cloud. No telemetry. No account required.

This document is the single source of truth for mobile. Last updated: M4 +
canned replies.

- [Architecture at a glance](#architecture-at-a-glance)
- [How a chat message is routed](#how-a-chat-message-is-routed)
- [On-device model catalog](#on-device-model-catalog)
- [Building and running](#building-and-running)
- [User settings](#user-settings)
- [File map](#file-map)
- [Troubleshooting](#troubleshooting)
- [Design decisions](#design-decisions)

---

## Architecture at a glance

```
    ┌──────────────────────────── Phone ───────────────────────────┐
    │                                                               │
    │   Chat screen                                                 │
    │        │                                                      │
    │        ▼                                                      │
    │   routeMessage(text) ──► 1. canned patterns   (0 ms)          │
    │                          2. intent analysis  (regex)          │
    │                          3. AI source pref   (SecureStore)    │
    │                          │                                    │
    │          ┌───────────────┴──────────────┐                     │
    │          ▼                              ▼                     │
    │   on-device (llama.rn)            LAN (fetch)                 │
    │   + memory recall via nomic       + FastAPI + Postgres        │
    │   + SQLite vector store           + pgvector                  │
    │   + whisper.rn for STT            + Ollama / 0G / OpenAI      │
    │                                                               │
    └───────────────────────────────────────────────────────────────┘
```

Three native modules must be present in the APK:
- **`llama.rn`** — chat + embedding (GGUF via llama.cpp)
- **`whisper.rn`** — speech-to-text (ggml via whisper.cpp)
- **`expo-device`** — RAM detection for model-size gating

Expo Go cannot load these. Any APK you distribute must be built from source
with `expo prebuild` + `expo run:android` or `eas build`.

---

## How a chat message is routed

```
User types / speaks a message
        │
        ▼
┌─ matchCanned(msg) ───────────────────────────────────────┐
│ Whole-message regex match for pleasantries              │
│ ("hi", "thanks", "how are you", "who are you", etc.)    │
│ → returns instantly with source: 'canned'               │
│ → still written to memory for later recall              │
└──────────────────────────────────────────────────────────┘
        │  no match
        ▼
┌─ analyzeIntent(msg) ─────────────────────────────────────┐
│ Pure regex + length rules, no ML                        │
│  • wallet/0G/tx/balance keywords → force-lan            │
│  • > 400 chars or ≥ 3 question marks or code → prefer-lan│
│  • ≤ 30 words, short/casual → prefer-local              │
│  • otherwise → neutral                                  │
└──────────────────────────────────────────────────────────┘
        │
        ▼
AI source preference (Auto / On-device / Laptop (LAN))
        │
        ├─ On-device:   local only; error if runtime/model missing
        ├─ Laptop:      LAN only; never touches local runtime
        └─ Auto:        apply the hint above with sensible fallbacks
```

On the local path, `routeMessage` also:
1. Embeds the query (Nomic Embed v1.5 Q4) and retrieves top-3 similar
   memories from SQLite (cosine similarity in JS, threshold 0.4).
2. Injects them into the system prompt as a `<memory>…</memory>` block.
3. After the reply, fire-and-forget writes both the user turn and a summary
   of the assistant turn back to the vector store.

See `apps/mobile/src/engine/ai-router.ts`.

---

## On-device model catalog

Everything downloadable from `Settings → On-device AI`. All models are
quantized GGUF/ggml files pulled from Hugging Face on first run (not bundled
in the APK). Stored under `<FileSystem.documentDirectory>/aethra-models/`.

### Chat models (pick one)

| Model                | Size   | Context | RAM     | Notes                          |
|----------------------|--------|---------|---------|--------------------------------|
| Qwen2.5-3B Instruct  | 2.0 GB | 4096    | 2.6 GB  | **Default.** Strong multilingual. |
| Phi-3-mini 4K        | 2.4 GB | 4096    | 2.8 GB  | Best reasoning for the size.   |
| Gemma-2-2B           | 1.6 GB | 4096    | 2.0 GB  | Smallest viable; 4 GB phones.  |

### Memory / embedding (pick one)

| Model                | Size    | Dim | RAM    |
|----------------------|---------|-----|--------|
| Nomic Embed Text v1.5| 90 MB   | 768 | 400 MB |

### Speech-to-text (pick one)

| Model                       | Size    | Languages      | RAM    |
|-----------------------------|---------|----------------|--------|
| Whisper Tiny English        | 32 MB   | en only        | 200 MB |
| Whisper Base English        | 57 MB   | en only        | 350 MB |
| Whisper Base Multilingual   | 57 MB   | 99 w/ auto-detect | 350 MB |
| Whisper Small Multilingual  | 190 MB  | 99 w/ auto-detect | 900 MB |

### Device fit warnings

Each row shows a warning based on `expo-device.totalMemory`:

- `⚠ may not fit on this device` — RAM < model's peak estimate
- `⚠ tight fit — may be slow` — RAM < 1.4× peak estimate
- (silent) — fits with headroom

Logic lives in `apps/mobile/src/engine/device-caps.ts`.

---

## Building and running

### Dev loop (Expo Go, no native modules)

For UI work only. Chat routing to on-device will fall back to LAN because
`llama.rn` isn't in Expo Go.

```bash
pnpm install
pnpm dev:api           # start FastAPI in another terminal
cd apps/mobile
pnpm dev               # scan QR with Expo Go
```

### Dev build (needed for on-device AI)

Required once per native-dep change:

```bash
pnpm install
cd apps/mobile
npx expo prebuild --clean       # (re)links llama.rn + whisper.rn + expo-device
npx expo run:android            # builds + installs the dev client on emulator/phone
```

After this, hot-reload works as normal; you only need to re-prebuild when
adding or updating a native module.

### Shippable APK (EAS)

```bash
cd apps/mobile
npx eas login                   # one-time
pnpm build:apk                  # cloud build → .apk URL
# or:
pnpm build:apk:local            # requires local Android SDK
```

Produces an installable `.apk`. Side-load on any Android phone.

### Baking a default backend URL

Optional. Create `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
```

The user can still override from Settings; this is only the default.

---

## User settings

Reachable from the Settings tab. Everything persists to `expo-secure-store`.

### AETHRA Server (your local AI)

Full LAN URL of the laptop running the FastAPI backend, e.g.
`http://192.168.1.42:8000`. The phone must be on the same Wi-Fi.
**Test Connection** pings `/api/v1/health` and shows latency or the real
error (not a fake fallback).

Find your laptop's LAN IP:
```bash
# macOS
ipconfig getifaddr en0
# Linux
hostname -I | awk '{print $1}'
```

Make sure your firewall allows inbound TCP on port 8000.

### On-device AI

**AI source** (saved across launches):

| Setting      | Behavior                                                           |
|--------------|--------------------------------------------------------------------|
| **Auto**     | Intent-aware. Blockchain → LAN. Long/code → prefer LAN. Short → local. Fallback chain otherwise. |
| **On-device**| Only phone's model. No network. Errors if runtime/model missing.   |
| **Laptop (LAN)** | Only the FastAPI backend. Standard thin-client mode.           |

Then download + select one chat model, one embedding model, and optionally
one STT model. Each row has a Download / Cancel / Delete action and shows a
device-fit warning if RAM is marginal.

### Memory

Shows the current count of on-device memories. **Clear all memories** wipes
the SQLite store. The dedicated **Memories** tab lists every stored memory
with timestamps and per-row delete.

### Diagnostics

**Run on-device benchmark** measures:
- Embedding latency (ms per sentence)
- Chat throughput (words/sec on a short canned prompt)
- Reports `llama.rn` / `whisper.rn` install status and device RAM.

### Account

Standard JWT auth. Logging out clears tokens and avatar cache but leaves
on-device memories intact (they're keyed by device, not account).

---

## File map

```
apps/mobile/
├── app/
│   ├── _layout.tsx              # bootstraps persisted server URL
│   └── (tabs)/
│       ├── _layout.tsx          # tab nav (Home, Chat, Companion, Memories, Settings)
│       ├── chat.tsx             # routeMessage + real mic recording + AiStatusBanner
│       ├── memories.tsx         # on-device memory list w/ per-row delete
│       ├── settings.tsx         # server URL, AI source, model manager, diagnostics
│       ├── companion.tsx
│       └── index.tsx
│
├── src/
│   ├── components/
│   │   └── AiStatusBanner.tsx   # red banner when LAN is unreachable
│   ├── engine/                  # on-device AI
│   │   ├── model-catalog.ts     # chat + embedding + STT model metadata
│   │   ├── model-manager.ts     # resume-safe downloads via expo-file-system
│   │   ├── local-llm.ts         # llama.rn wrapper, chat template per family
│   │   ├── local-embeddings.ts  # separate llama.rn context with embedding: true
│   │   ├── local-stt.ts         # whisper.rn wrapper + expo-av recording
│   │   ├── memory-store.ts      # SQLite BLOB vector store + cosine search
│   │   ├── memory-service.ts    # high-level remember/recall fail-soft wrappers
│   │   ├── canned-replies.ts    # regex patterns for pleasantries
│   │   ├── intent.ts            # blockchain / long / simple classifier
│   │   ├── device-caps.ts       # RAM detection + checkModelFit
│   │   ├── diagnostics.ts       # benchmark helpers
│   │   └── ai-router.ts         # canned → intent → local/LAN routing
│   └── services/
│       ├── api-client.ts        # fetch wrapper + persisted base URL bootstrap
│       ├── auth-storage.ts      # expo-secure-store for JWT
│       ├── server-config.ts     # persisted LAN URL
│       ├── ai-status.ts         # /health poll + useAiStatus() hook
│       └── preferences.ts       # AI source, selected chat/embedding/STT model
│
├── eas.json                     # preview=APK, production=AAB
├── .env.example                 # EXPO_PUBLIC_API_URL default
└── package.json
```

---

## Troubleshooting

**"Network request failed" on the phone**
Your laptop's firewall is blocking port 8000. macOS: System Settings →
Network → Firewall → allow Python/uvicorn. Linux: `sudo ufw allow 8000/tcp`.

**"Local AI runtime is not installed on this build"**
You're using Expo Go or an APK built before `pnpm install` picked up
`llama.rn`. Run `npx expo prebuild --clean` then `expo run:android` or a
fresh EAS build.

**"Model is not downloaded" after downloading**
Check `Settings → On-device AI` — did the row re-render as "downloaded"? If
the app was killed mid-download, Delete the partial file and re-download.

**Model download times out on cellular**
Only download on Wi-Fi. The 2 GB chat model can take 20+ min on 4G.

**Phone rejects installed APK as "harmful"**
Normal for side-loaded APKs with no Play Store signature. Accept the risk
prompt. For broader distribution, sign and upload to Play Store.

**Chat replies are `[AI unavailable · lan] Can't reach AETHRA server`**
The red banner at the top of Chat shows the real error. Open Settings →
AETHRA Server → verify the URL matches your laptop's current LAN IP (it
changes when you switch networks). Tap Test Connection.

**Blockchain queries fail even on LAN**
The FastAPI backend needs `OG_API_KEY` and reachable `OG_RPC_URL`. See
root `.env.example` for the 0G Router variables.

**Expo prebuild fails: "cannot find module metro"**
Delete `node_modules` and `apps/mobile/android/` and `apps/mobile/ios/`,
then `pnpm install && npx expo prebuild --clean`.

---

## Design decisions

### Why hybrid instead of pure on-device or pure cloud?

Pure on-device phones out of 7B+ quality models. Pure cloud phones out of
privacy. Hybrid: on-device handles 80% of turns (short, casual, personal),
LAN handles the 20% that need bigger models (long/complex) or the network
(blockchain RPC). User picks the balance per message or via a global setting.

### Why canned replies at all?

"hi" and "thanks" don't deserve a 2-second model round-trip. Canned replies
answer in ~0 ms with brand-consistent copy and never fail (no model, no
network, no permission needed). They're whole-message-anchored so real
queries aren't intercepted.

### Why store embeddings as BLOB in SQLite instead of sqlite-vec?

Simpler dependency surface. Cosine similarity over float32 blobs in JS is
fast enough at a few thousand rows on a modern phone (<50 ms).
`sqlite-vec` would be strictly better but adds another native build; defer
until memory counts routinely exceed ~10k.

### Why LAN-first for the backend (not cloud-first)?

The user's AI runs on the user's own hardware. 0G keys, memories, and
conversations never leave their network. This is the whole point of AETHRA.

### Why llama.rn and whisper.rn (same vendor, mybigday)?

Same maintainer, same build conventions, minimal duplicate native code.
Alternative candidates evaluated: `react-native-executorch` (less mature),
`onnxruntime-react-native` (needs ONNX model conversions we'd maintain).

### Why 3B-class chat models, not 7B?

3B Q4_K_M fits in ~2.6 GB of RAM with 4K context. A 7B Q4 wants ~5 GB
peak — roughly the entire RAM of a $400 Android phone. 3B is the current
sweet spot for mobile; this ceiling will rise with each new flagship.
