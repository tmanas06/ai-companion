# AI Companion — Master Architecture Reference

> **Status**: Production Candidate · October 2026  
> **Purpose**: Single source of truth for agents and contributors to understand the entire system.  
> **Repository**: `/home/manas/Projects/ai-companion`  
> **Related docs**: `docs/architecture/local-first-architecture.md` (privacy & local-first details), milestone validation reports in repo root.

---

## 1. Project Overview

**AI Companion** is a modular, privacy-first AI companion application with persistent memory, customizable avatars, and cross-platform support. Users can chat with a 3D-rendered companion, customize appearance via a studio, manage memories with consent controls, and use voice input/output.

### Core Principles
- **Privacy by design**: Explicit consent for sensitive data; local-first inference options; strict tenant isolation.
- **Modular monolith**: Single deployable FastAPI API with clear internal boundaries (avatar, companion, conversation, memory, voice, sadtalker).
- **Provider independence**: AI providers behind abstract interfaces (Ollama, OpenAI, Anthropic).
- **Type safety**: End-to-end TypeScript with shared schemas consumed by web and mobile.
- **Mobile native**: Expo 51 React Native app with pure Three.js + expo-gl rendering (not a webview).

---

## 2. Repository Structure

```
ai-companion/
├── apps/
│   ├── api/                 # FastAPI backend (Python 3.12, uv, SQLModel, PostgreSQL + pgvector)
│   │   ├── src/app/
│   │   │   ├── api/v1/endpoints/   # REST route handlers (auth, avatar, companion, conversation, memory, voice, sadtalker)
│   │   │   ├── core/               # Config, database, security, exceptions, logging
│   │   │   ├── models/             # SQLModel DB models (User, Avatar, AvatarAsset, Companion, Conversation, Message, Memory)
│   │   │   ├── providers/          # AI provider implementations (Ollama, OpenAI, Anthropic, embedding, privacy, factory)
│   │   │   ├── repositories/       # Data access layer
│   │   │   ├── schemas/            # Pydantic v2 request/response schemas
│   │   │   ├── services/           # Business logic (avatar, companion, conversation, extraction, memory, sadtalker, sensitivity, voice, emotion)
│   │   │   └── main.py             # FastAPI app factory + global exception handlers + StaticFiles mount at /models
│   │   ├── alembic/                # DB migrations (001_initial → 003_embedding_dimension_768)
│   │   ├── static/models/          # 3D GLB assets served directly by FastAPI (decoupled from Next.js)
│   │   ├── tests/                  # Pytest suite (auth, health, providers, memory RAG, avatar, chat streaming, voice, sadtalker, multi-user E2E)
│   │   ├── pyproject.toml, uv.lock, pytest.ini, alembic.ini
│   │   └── keys/                   # RS256 JWT keypair (generated at setup)
│   ├── web/                    # Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
│   │   ├── src/app/
│   │   │   ├── (app)/chat/         # Live voice companion page (3D avatar + viseme lip-sync + push-to-talk)
│   │   │   ├── (app)/studio/       # Avatar studio customization page
│   │   │   ├── (app)/companion/    # Companion preview
│   │   │   ├── (app)/memories/     # Memory inspection/correction/deletion
│   │   │   ├── (app)/onboarding/   # Companion selection onboarding
│   │   │   ├── (auth)/             # Login, register
│   │   │   ├── (settings)/         # Settings
│   │   │   └── api/                # Next.js API proxy routes (avatars, companions, conversations, memories, voice)
│   │   ├── src/components/
│   │   │   ├── companion/3d/       # FullBodyAvatar, FullBodyAvatarModel, FullBodyAvatarScene (Three.js)
│   │   │   ├── studio/             # AvatarStudioContainer, AvatarStudioModel, AvatarStudioViewport
│   │   │   └── ...                 # VoiceSettingsModal, PreviewTab, AppLayout, etc.
│   │   ├── src/hooks/              # useLiveVoiceCompanion, etc.
│   │   ├── src/lib/                # api-client, voice-manager, avatar-state-machine, emotion-selector, avatar-video-manifest, server-auth, companion-presets
│   │   ├── public/models/          # 3D GLB assets (aria_photorealistic, marcus_photorealistic, mobile variants, textures, animations.glb)
│   │   ├── public/avatars/         # 2D portraits (jpg/webp), emotion video clips (mp4/webm), SVG presets
│   │   ├── public/avatars/aria/    # Organized emotion video clips (idle, listening, thinking, speaking, happy, empathetic, sad, surprised, confused, laughing, greeting, goodbye)
│   │   ├── e2e/                    # Playwright tests
│   │   └── package.json, next.config.js, tailwind.config.ts, tsconfig.json, jest.config.js, playwright.config.ts
│   └── mobile/                 # Expo 51, React Native 0.74, TypeScript, NativeWind, Hermes
│       ├── app/                  # Expo Router file-based navigation
│       │   ├── (tabs)/_layout.tsx  # Bottom tab navigator (Index, Chat, Companion/Studio, Settings)
│       │   ├── (tabs)/chat.tsx     # Live voice chat with MobileAvatarRenderer + push-to-talk
│       │   ├── (tabs)/companion.tsx # Mobile avatar studio (3D viewport, morph sliders, model switcher)
│       │   ├── (tabs)/settings.tsx # Auth status, sign-out, API URL config, licensing notices
│       │   └── index.tsx           # Home overview
│       ├── src/
│       │   ├── components/avatar/
│       │   │   ├── ThreeSceneManager.ts      # Pure Three.js + expo-gl WebGL renderer
│       │   │   ├── MobileAvatarRenderer.tsx  # GLView integration + error boundary → 2D fallback
│       │   │   └── Avatar2DFallback.tsx      # Crash-proof 2D animated stage
│       │   ├── services/
│       │   │   ├── auth-storage.ts           # expo-secure-store JWT wrapper
│       │   │   ├── api-client.ts             # Authenticated HTTP client (10.0.2.2 emulator loopback support)
│       │   │   ├── avatar-service.ts         # Backend /api/v1/avatars client + migrateAvatarConfig
│       │   │   └── model-cache-manager.ts    # Persistent GLB disk cache, ETag revalidation, atomic downloads
│       │   └── __tests__/                    # Jest test suites (auth-storage, avatar-service, model-cache-manager, Avatar2DFallback, MobileAvatarRenderer)
│       ├── android/              # Expo prebuild native Gradle project
│       ├── assets/               # App icons, splash, adaptive icon
│       ├── app.config.js, package.json, babel.config.js, tailwind.config.js, tsconfig.json
│       └── THIRD_PARTY_NOTICES.md # MakeHuman CC-BY 4.0, Mixamo, OFL font attributions
├── packages/
│   └── shared/                 # Shared TypeScript types/schemas (@ai-companion/shared)
│       └── src/index.ts          # Avatar3DConfigSchema, AvatarConfig (v1 legacy), DEFAULT_AVATAR_3D_CONFIG, migrateAvatarConfig(), supported asset enums
├── scripts/                    # Asset generation pipelines
│   ├── generate_aria.py          # Blender 4.2 + MPFB2 headless pipeline → aria_photorealistic.glb
│   ├── generate_marcus.py        # Blender 4.2 + MPFB2 headless pipeline → marcus_photorealistic.glb
│   ├── generate_aria_videos.py   # PIL + NumPy + ffmpeg → 2D emotion video clips (mp4/webm)
│   └── generate_skin_textures.py # PIL + NumPy → procedural PBR normal + roughness maps
├── docs/
│   ├── architecture/
│   │   ├── local-first-architecture.md   # Privacy modes, local-first storage, RAG pipeline, threat model
│   │   └── MASTER_ARCHITECTURE.md        # This document
│   ├── AVATAR_STUDIO_IMPLEMENTATION_PLAN.md
│   ├── AVATAR_STUDIO_LICENSE_AUDIT.md
│   ├── AVATAR_STUDIO_PERFORMANCE_PLAN.md
│   └── AVATAR_STUDIO_RESEARCH.md
├── .opencode/skills/             # Opencode companion skills (avatar-system, companion-architecture, companion-memory, voice-session-engineering)
├── docker-compose.yml            # PostgreSQL 16 + pgvector, Redis 7, MinIO
├── start.sh                      # Unified startup script (infra, web, api, mobile)
├── package.json                  # Root pnpm workspace + turbo
├── pnpm-workspace.yaml
└── turbo.json                    # Turborepo pipeline config (build, lint, typecheck, test, dev)
```

---

## 3. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Backend API | FastAPI | 0.110 | REST API, async, Pydantic v2 |
| Backend language | Python | 3.12 | Service logic, providers, DB models |
| DB / ORM | PostgreSQL + pgvector / SQLModel | 16 / latest | User data, avatars, conversations, memories, embeddings (768-dim) |
| Cache / Queue | Redis | 7 | Infrastructure (currently provisioned, limited app usage) |
| Object storage | MinIO | — | Infrastructure (blob storage, limited app usage) |
| Frontend Web | Next.js (App Router) | 14 | SSR web UI, API proxy routes |
| Frontend Web UI | React + Tailwind CSS | 18 | Components, styling |
| 3D Web Rendering | Three.js | 0.164.1 | GLB loading, morph targets, viseme animation |
| Mobile | Expo + React Native | 51 / 0.74.5 | Native iOS/Android app |
| Mobile JS Engine | Hermes | — | JS execution |
| Mobile 3D Rendering | expo-gl + Three.js | 14.0.2 / 0.164.1 | Native WebGL context, pure Three.js renderer |
| Mobile Styling | NativeWind | 4.0 | Tailwind for React Native |
| Shared Types | TypeScript | — | `@ai-companion/shared` package consumed by web + mobile |
| Monorepo | Turborepo + pnpm workspaces | 2 / 9 | Build pipeline, task orchestration |
| AI Providers | Ollama, OpenAI, Anthropic | — | Local and cloud LLM/embedding providers |
| STT | faster-whisper | — | Local speech-to-text |
| TTS | Edge TTS | — | Neural text-to-speech (JennyNeural, GuyNeural) |
| Talking-head Video | SadTalker | V0.0.2 | Local audio-driven portrait animation (isolated, non-commercial) |
| 3D Asset Generation | Blender 4.2.3 + MPFB2 | — | Headless GLB model generation |
| Texture Generation | PIL + NumPy | — | Procedural PBR normal/roughness maps |
| Video Generation | ffmpeg | — | H.264 MP4 + VP9 WebM encoding |
| Testing | Pytest + Jest + Playwright | — | Backend unit/integration, web unit/E2E, mobile unit |
| Lint/Format | ESLint, Prettier, Ruff, mypy | — | Code quality |
| Container | Docker Compose | — | Local infra |

---

## 4. Architecture Layers

### 4.1 Presentation Layer
- **Web**: Next.js App Router with route groups `(app)`, `(auth)`, `(settings)`. Server components for pages, client components for interactive 3D/voice.
- **Mobile**: Expo Router file-based navigation with bottom tab layout (`app/(tabs)/_layout.tsx`). Four tabs: Index (home), Chat, Companion (studio), Settings.

### 4.2 Application Layer
Backend business logic lives in `apps/api/src/app/services/`:
- `avatar.py` — Avatar CRUD, active-avatar enforcement (one active per user), tenant isolation.
- `companion.py` — Companion CRUD linked to avatars.
- `conversation.py` — Chat turns, message persistence, RAG memory injection, zero-orphan transactional semantics.
- `memory.py` — Memory CRUD, consent lifecycle (pending → approved/denied), supersede pattern, vector search.
- `extraction.py` — Memory extraction from conversation turns (background).
- `voice.py` — Voice turn orchestration (STT → LLM → TTS), greeting, synthesize, transcribe.
- `sadtalker.py` — Local talking-head video job orchestrator (subprocess management, dedup, timeout, cleanup).
- `emotion.py` — Conversational emotion analysis (rule-based, bounded set).
- `sensitivity.py` — Sensitivity classification for memories.

### 4.3 Provider Layer
`apps/api/src/app/providers/`:
- `factory.py` — Provider selection with privacy mode enforcement (`strict-local`, `private-machine`, `cloud-allowed`). No implicit cloud fallback.
- `ollama_provider.py` — Local Ollama chat + embeddings (nomic-embed-text, 768-dim).
- `openai_provider.py` — OpenAI chat + embeddings.
- `anthropic_provider.py` — Anthropic chat.
- `privacy.py` — Privacy violation and provider configuration error handling.
- `__init__.py` — `get_provider()`, `get_embedding_provider()`, `validate_provider_privacy()`, `is_loopback_endpoint()`.

### 4.4 Data Layer
- SQLModel models in `apps/api/src/app/models/`: `User`, `Avatar`, `AvatarAsset`, `Companion`, `Conversation`, `Message`, `Memory`.
- Alembic migrations: `001_initial.py`, `002_phase1_models.py`, `003_embedding_dimension_768.py` (Vector(1536) → Vector(768)).
- PostgreSQL + pgvector with HNSW index on `memories.embedding` (cosine distance, partial index on non-null, non-deleted, approved/auto-approved).

---

## 5. Data Models & Schemas

### 5.1 Shared TypeScript (`packages/shared/src/index.ts`)
Exported contracts consumed by both web and mobile:

- **`AvatarConfig`** (v1, legacy 2D): `version: 1`, `layers: AvatarLayerConfig[]` (type, variant, color, z_index, visible).
- **`Avatar3DConfigSchema`** (v2, current 3D): `version: 2`, plus:
  - `base_model_id`: `aria_photorealistic` \| `marcus_photorealistic` \| `human_*`
  - `face`: `FaceMorphParametersSchema` (jaw_width, chin_length, cheekbone_height, eye_size, nose_bridge_width, lip_fullness_*, mouth_width, etc. — all 0.0–1.0)
  - `materials`: `MaterialParametersSchema` (skin_tone hex, eye_color hex, roughness values)
  - `hair`: `HairConfigurationSchema` (asset_id from `SupportedHairAssetId`, color hex)
  - `body`: `BodyParametersSchema` (height 0.85–1.15×, muscle, weight)
  - `clothing`: `ClothingConfigurationSchema` (outfit_preset_id from `SupportedClothingAssetId`, colors)
  - `accessories`: `AccessoryItemSchema[]` (asset_id, slot, color)
  - `behavior`: `BehaviorConfigurationSchema` (default_pose, blink_frequency_multiplier, smile_tendency)
- **`DEFAULT_AVATAR_3D_CONFIG`** — Default fallback config.
- **`migrateAvatarConfig()`** — Migrates legacy v1 → v2.

Supported asset enums (allowlist to prevent path traversal):
- `SupportedBaseModelId`: aria_photorealistic, marcus_photorealistic, human_female_v1, human_male_v1, human_universal_v1
- `SupportedHairAssetId`: ponytail01, short02, bob01, wavy_long, buzz_cut, afro_fade, none
- `SupportedClothingAssetId`: female_elegantsuit01, male_casualsuit01, casual_tshirt_jeans, smart_blazer, athletic_wear, default
- `SupportedAccessoryAssetId`: glasses_round, glasses_classic, earrings_studs, necklace_simple, none

### 5.2 Pydantic Schemas (`apps/api/src/app/schemas/`)
Mirror the shared TypeScript contracts for API validation:
- `avatar.py` — `AvatarCreate`, `AvatarUpdate`, `AvatarResponse`, `Avatar3DConfigSchema`, etc.
- `sadtalker.py` — `SadTalkerJobCreateRequest`, `SadTalkerJobResponse`, `SadTalkerServiceStatus`
- `auth.py`, `conversation.py`, `memory.py`, `companion.py`, `voice.py` — corresponding endpoint schemas.

---

## 6. Avatar System (2D Legacy → 3D Current)

### 6.1 Model Assets
Two photorealistic 3D companions generated headlessly in Blender 4.2.3 with MPFB2:

| Asset | Path | Size | Texture | Use |
|-------|------|------|---------|-----|
| Aria (female) | `public/models/aria_photorealistic.glb` | ~32 MB | 2048×2048 PNG | Desktop web 3D |
| Aria mobile | `public/models/aria_photorealistic_mobile.glb` | ~12 MB | 1024×1024 WebP | Mobile native |
| Marcus (male) | `public/models/marcus_photorealistic.glb` | ~36 MB | 2048×2048 PNG | Desktop web 3D |
| Marcus mobile | `public/models/marcus_photorealistic_mobile.glb` | ~11 MB | 1024×1024 WebP | Mobile native |
| Animations | `public/models/animations.glb` | ~8.3 MB | — | Idle, Talking_0/1/2, Laughing |
| Fallback | `public/models/avatar.glb` | ~4 MB | — | Preserved fallback |

Each model contains:
- Skinned mesh with Mixamo-compatible humanoid armature (`mixamorig:` prefixes stripped)
- 102 ARKit 52 + Microsoft viseme morph targets (jawOpen, viseme_aa, eyeBlinkLeft/Right, mouthSmileLeft/Right, etc.)
- PBR materials (MeshStandardMaterial) with micro-pore normal maps and multi-zone roughness
- Embedded animations: Idle (4s loop), Talking_0/1/2, Laughing

### 6.2 Texture Generation (`scripts/generate_skin_textures.py`)
Procedural PBR maps using PIL + NumPy:
- **Normal maps**: Tangent-space, multi-scale dermal pore noise, epidermal grain, subtle striations. OpenGL encoding (+X right, +Y up, +Z out).
- **Roughness maps**: glTF Green channel — lips ~0.26 (moist), tear ducts ~0.18, T-zone ~0.50, cheeks ~0.56, neck/body ~0.60.
- Outputs: `aria_skin_normal.png`, `aria_skin_roughness.png`, `marcus_skin_normal.png`, `marcus_skin_roughness.png` (2048×2048).

### 6.3 Model Generation Pipeline (`scripts/generate_aria.py`, `scripts/generate_marcus.py`)
Run via: `blender --background --python scripts/generate_aria.py`

Phases:
1. **Prerequisites** — Verify Blender 4.2+, enable MPFB2 addon, download/extract MakeHuman asset packs (faceunits01, visemes01, system_assets, skins01 from `files2.makehumancommunity.org`).
2. **Base mesh** — `HumanService.create_human()`, configure proportions (gender, age, muscle, weight, height, ethnicity).
3. **Rig** — `HumanService.add_builtin_rig(human, "mixamo")`, normalize bone names.
4. **Morph targets** — `FaceService.load_targets(human, load_microsoft_visemes=True, load_arkit_faceunits=True)`.
5. **Anatomical layers** — Eyes, teeth (jawOpen + viseme_aa shape keys), eyebrows, eyelashes, hair (ponytail01/short02), clothing (female_elegantsuit01/male_casualsuit01), shoes.
6. **PBR skin** — Apply MakeHuman skin material (`toigo_light_skin_with_natural_makeup.mhmat` / `young_caucasian_male.mhmat`).
7. **Helper removal** — `ExportService.bake_modifiers_remove_helpers()`.
8. **Viseme aliases** — Map `viseme_aa`→`jawOpen`, `viseme_O`→`mouthFunnel`, etc.
9. **Displacement** — Outward displacement on clothes/shoes to prevent z-fighting.
10. **Shader calibration** — Connect normal/roughness maps, set Metallic=0, Roughness per material (skin 0.52, eyes 0.04, teeth 0.18, suit 0.82, hair 0.50).
11. **Animations** — Bake Idle, Talking_0/1/2, Laughing onto rig, push to NLA tracks.
12. **Export** — `bpy.ops.export_scene.gltf(GLB, export_animations=True, export_morph=True, export_skins=True)`.

### 6.4 2D Portraits & SVG Presets
- `public/avatars/{aria,marcus,elena,liam}-portrait.jpg/.webp` — Reference portraits.
- `public/avatars/{aria,marcus,elena,liam}-blink.jpg/.webp` — Blink variants.
- `public/avatars/{aria,marcus,elena,liam}-speak.jpg/.webp` — Speak variants.
- `public/avatars/*.svg` — Cartoon/illustrated companion presets (aria-realistic, atlas-3d, kai-anime, luna-anime, marcus-realistic, maya-illustrated, nova-3d, sage-illustrated).

### 6.5 Video Clip Generation (`scripts/generate_aria_videos.py`)
Procedural 2D talking-head emotion clips using PIL + NumPy + ffmpeg:
- Inputs: `aria-portrait.webp`, `aria-blink.webp`, `aria-speak.webp` (720×720).
- Feathered elliptical masks for eye and mouth regions.
- `composite_frame()` blends portrait↔blink (eye mask) and portrait↔speak (mouth mask) with head tilt/scale/offset.
- **ffmpeg rawvideo pipe**: H.264 MP4 (libx264, veryfast, crf 20, yuv420p, +faststart) + VP9 WebM (realtime, cpu-used 6).
- Clips (2–5s, 30 FPS): idle, listening, thinking, speaking, happy, empathetic, sad, surprised, confused, laughing, greeting, goodbye.
- Output: `public/avatars/aria/{emotion}/{clip}_01.mp4` + `.webm`.

### 6.6 Rendering
- **Web**: `FullBodyAvatarModel.tsx` — Three.js `WebGLRenderer`, loads GLB via `GLTFLoader`, applies morph targets additively (customized resting jaw + viseme speech aperture), natural blinking loop (3.2–5.7s intervals, 140ms duration), exponential smoothing for viseme decay, interruption handling.
- **Mobile**: `ThreeSceneManager.ts` — Pure Three.js + `expo-gl` `GLView` (chosen over R3F v9 due to React 18 incompatibility). Camera presets (face/bust/full), 16 facial morph keys, procedural speech mouth animation, natural blinking, full GPU disposal on unmount.
- **Fallback**: `Avatar2DFallback.tsx` — Zero-dependency React Native 2D stage; renders if WebGL context is lost or unsupported. Voice and conversation continue uninterrupted.

---

## 7. Voice Pipeline

### 7.1 Endpoints (`apps/api/src/app/api/v1/endpoints/voice.py`)
- `POST /api/v1/voice/turn` — Full voice turn: STT (faster-whisper) → memory RAG → LLM (Ollama/OpenAI/Anthropic) → TTS (Edge TTS) with viseme cue timestamps.
- `POST /api/v1/voice/greeting` — Initial greeting audio + viseme cues.
- `POST /api/v1/voice/synthesize` — Standalone neural TTS.
- `POST /api/v1/voice/transcribe` — Standalone Whisper transcription.

### 7.2 Voice Service (`apps/api/src/app/services/voice.py`)
Orchestrates STT → LLM → TTS. Returns audio bytes and viseme timestamps.

### 7.3 Frontend Voice
- **Web**: `useLiveVoiceCompanion.ts` — Manages Web Speech API (STT), audio playback, viseme calculation from audio levels, push-to-talk, interruption, greeting on mount.
- **Mobile**: `chat.tsx` — Push-to-talk microphone button, audio waves, text drawer fallback, `MobileAvatarRenderer` driven by `isSpeaking`/`isListening`/`audioLevel`.

### 7.4 Emotion Analysis (`apps/api/src/app/services/emotion.py`)
Rule-based conversational emotion inference from user text + reply text. Bounded set: `neutral, happy, empathetic, sad, surprised, curious, confused, laughing, reassuring`. Synonym mapping (joy→happy, compassionate→empathetic, etc.). Returns `(emotion, intensity)`.

---

## 8. Memory System (RAG + Consent)

### 8.1 Memory Lifecycle
States: `pending` (sensitive, needs approval) → `approved` / `denied` → `superseded` (on correction). Auto-approved for non-sensitive memories.

### 8.2 RAG Pipeline
1. Embed user query via `OllamaEmbeddingProvider` (nomic-embed-text, 768-dim).
2. Vector search: `memories.embedding <=> query_embedding` (pgvector cosine distance), filtered by `user_id`, `companion_id`, `deleted_at IS NULL`, `embedding IS NOT NULL`, `consent_status IN ('approved','auto_approved')`, `distance <= threshold`.
3. Inject top-k memories into system prompt inside `<context>` block (treated as untrusted data).
4. Graceful degradation: if embedding/search fails, chat continues unaugmented.

### 8.3 Consent Flow
- `GET /api/v1/memories/pending-consent` — List pending memories.
- `POST /api/v1/memories/{id}/consent` — Approve or deny.
- `POST /api/v1/memories/{id}/supersede` — Correct a fact (old memory soft-deleted, embedding cleared).

### 8.4 Embedding Dimension
Migrated from `Vector(1536)` (OpenAI ada-002) to `Vector(768)` (nomic-embed-text) via migration `003_embedding_dimension_768.py`.

---

## 9. Authentication & Security

### 9.1 Auth (`apps/api/src/app/api/v1/endpoints/auth.py`)
- `POST /api/v1/auth/register` — Argon2id password hashing, RS256 JWT access (15 min) + refresh (30 day) tokens.
- `POST /api/v1/auth/login` — Credential validation, token issuance.
- `POST /api/v1/auth/logout` — Token revocation.
- `POST /api/v1/auth/refresh` — Refresh token rotation.
- `GET /api/v1/auth/me` — Current user profile.

### 9.2 Security (`apps/api/src/app/core/security.py`)
- RS256 JWT signing (keys in `apps/api/keys/`).
- `get_current_user()` dependency — Bearer token or `access_token` cookie.
- `PrivacyViolationError` (HTTP 403) and `ProviderConfigurationError` (HTTP 503) — global exception handlers in `main.py`.

### 9.3 Privacy Modes (`apps/api/src/app/core/privacy.py`)
- `strict-local` — Only local loopback inference; no cloud providers.
- `private-machine` (default) — Ollama on localhost or user-managed LAN machine; no OpenAI/Anthropic.
- `cloud-allowed` — Any provider, but explicit selection required (no implicit fallback).
- `is_loopback_endpoint()` — Anti-DNS-rebinding: only `localhost` and IPv4 `127.0.0.0/8` / IPv6 `::1` accepted; no arbitrary DNS, no credentials in URL.

### 9.4 Tenant Isolation
All avatar, conversation, and memory queries filter by `user_id`. Multi-user E2E tests verify zero cross-user leakage (404 on cross-user avatar access).

---

## 10. SadTalker (Talking-Head Video)

### 10.1 Service (`apps/api/src/app/services/sadtalker.py`)
Local subprocess orchestrator for SadTalker V0.0.2:
- **Approved portraits**: aria, marcus, elena, liam (whitelist, path traversal protection).
- **Emotion tuning**: expression_scale and pose_style per emotion (neutral, happy, empathetic, surprised, laughing, etc.).
- **Job lifecycle**: queued → processing → completed/failed/cancelled. Deduplication by SHA-256 of audio + portrait + tuning.
- **Concurrency**: `asyncio.Semaphore` (configurable max jobs).
- **Timeout**: Configurable `SADTALKER_TIMEOUT_SECONDS`; process group kill on timeout.
- **Cleanup**: Temp audio deleted, intermediate dirs removed, expired videos (> retention hours) purged.

### 10.2 Endpoints (`apps/api/src/app/api/v1/endpoints/sadtalker.py`)
- `GET /sadtalker/status` — Hardware availability, checkpoint status, queue metrics.
- `POST /sadtalker/jobs` — Submit job (audio file or base64, portrait_id, emotion, expression_scale, pose_style, size, still).
- `GET /sadtalker/jobs/{id}` — Job status and progress.
- `GET /sadtalker/jobs/{id}/video` — Stream MP4 video.
- `DELETE /sadtalker/jobs/{id}` — Cancel job.

### 10.3 Isolation
SadTalker checkpoints (`.pth`, `.safetensors`) are **excluded from mobile bundle** and production web deployments. Non-commercial license. Service disabled by default (`SADTALKER_ENABLED=False`).

---

## 11. Mobile App Architecture

### 11.1 Navigation (Expo Router)
`app/(tabs)/_layout.tsx` — Bottom tab navigator:
- `index.tsx` — Home overview.
- `chat.tsx` — Live voice chat with 3D avatar.
- `companion.tsx` — Avatar studio customization.
- `settings.tsx` — Auth, sign-out, API config, licensing.

### 11.2 3D Rendering Stack
- `expo-gl` `GLView` provides WebGL context.
- `ThreeSceneManager.ts` — Pure Three.js scene (no R3F v9 due to React 18 incompatibility).
- `MobileAvatarRenderer.tsx` — Error boundary; auto-falls back to `Avatar2DFallback` on WebGL failure.
- `Avatar2DFallback.tsx` — Animated 2D stage reflecting `Avatar3DConfig` (skin tone, eye/hair color, wardrobe).

### 11.3 Services
- `auth-storage.ts` — `expo-secure-store` JWT access/refresh tokens with in-memory fallback for tests.
- `api-client.ts` — Authenticated HTTP client; resolves base URL priority: custom override → `EXPO_PUBLIC_API_URL` → `http://10.0.2.2:8000` (emulator) → `http://localhost:8000`. Auto token cleanup on 401.
- `avatar-service.ts` — Backend avatar CRUD client; uses `migrateAvatarConfig` from `@ai-companion/shared`; `clearAvatarCache()` on sign-out.
- `model-cache-manager.ts` — Persistent GLB disk cache in `FileSystem.documentDirectory/avatar_models/`. Atomic `.tmp` download → `validateGlbHeader()` (4-byte `glTF` magic) → atomic move. ETag/Content-Length revalidation. Offline fallback. `clearAllAvatarData(includeModelFiles=true)` on logout.

### 11.4 Native Android
- `apps/mobile/android/` — Expo prebuild Gradle project.
- Permissions: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`, etc.
- Hermes engine enabled. Release APK (74.87 MB), Release AAB (37.69 MB), Debug APK built and checksummed. Currently signed with debug keystore.

---

## 12. API Routes Summary

### Backend (`/api/v1/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | User registration |
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/refresh` | Token refresh |
| GET | `/auth/me` | Current user |
| GET | `/avatars` | List user avatars |
| POST | `/avatars` | Create avatar |
| GET | `/avatars/active` | Get active avatar |
| GET/PATCH/DELETE | `/avatars/{id}` | Avatar CRUD (owner-only) |
| POST | `/avatars/{id}/activate` | Set active avatar |
| GET | `/companions` | List companions |
| POST | `/companions` | Create companion |
| GET | `/conversations` | List conversations |
| POST | `/conversations/chat` | Chat turn (streaming planned) |
| GET | `/memories` | List memories |
| GET | `/memories/pending-consent` | Pending consent memories |
| POST | `/memories/{id}/consent` | Approve/deny |
| POST | `/memories/{id}/supersede` | Correct memory |
| GET | `/memories/vector-search` | Semantic memory search |
| POST | `/voice/turn` | Voice turn |
| POST | `/voice/greeting` | Greeting |
| POST | `/voice/synthesize` | TTS |
| POST | `/voice/transcribe` | STT |
| GET | `/sadtalker/status` | Service status |
| POST | `/sadtalker/jobs` | Submit video job |
| GET | `/sadtalker/jobs/{id}` | Job status |
| GET | `/sadtalker/jobs/{id}/video` | Video stream |
| GET | `/health` | Health check |

### Next.js Proxy (`/api/`)
Web proxies avatar, companion, conversation, memory, and voice routes to FastAPI with Bearer/cookie token passthrough.

---

## 13. Asset Generation Pipeline

| Script | Input | Output | Tool |
|--------|-------|--------|------|
| `generate_aria.py` | MakeHuman assets (CC0) | `aria_photorealistic.glb` | Blender 4.2 + MPFB2 |
| `generate_marcus.py` | MakeHuman assets (CC0) | `marcus_photorealistic.glb` | Blender 4.2 + MPFB2 |
| `generate_skin_textures.py` | — (procedural) | `*_skin_normal.png`, `*_skin_roughness.png` | PIL + NumPy |
| `generate_aria_videos.py` | `aria-portrait.webp`, `aria-blink.webp`, `aria-speak.webp` | `public/avatars/aria/*/*.mp4` + `.webm` | PIL + NumPy + ffmpeg |

---

## 14. Milestone Roadmap & Status

| Milestone | Name | Status | Key Deliverables |
|-----------|------|--------|-----------------|
| 0 | Research & License Audit | ✅ Completed | Asset licensing audit (CC0, CC-BY 4.0, Mixamo, OFL), local-first architecture proposal |
| 0.1 | State Integrity & Security Hardening | ✅ Completed | Atomic chat persistence, global error handlers, strict-local URL hardening, provider privacy enforcement |
| 1 | Local Embeddings & Vector RAG | ✅ Completed | Ollama nomic-embed-text (768-dim), pgvector HNSW, consent-aware memory indexing, RAG chat augmentation |
| 2 | Autonomous Memory Extraction | ✅ Completed | Background memory extraction from conversation turns, consent classification |
| 2.1 | Security, Consent, Correctness Patch | ✅ Completed | Sensitivity service, provenance migration, memory patches |
| 2.2 | Memory Extraction & Consent-Integrity Fixes | ✅ Completed | Extraction service fixes, consent integrity |
| 3 | Real-Time Chat Streaming | ✅ Completed (3.1) | Incremental chat streaming, Ollama provider, JWT keys |
| 3.x | Voice & Avatar Integration | ✅ Completed | STT/TTS/voice turn, 3D avatar viseme lip-sync, studio customization |
| 4 | Mobile Viewport & Native Studio | ✅ Completed (Conditional GO) | Expo native app, expo-gl Three.js renderer, avatar studio, model caching, release APK/AAB |
| 5 | Asset Optimization | ⚠️ Partial | Texture downsampling to 1024×1024 WebP (63–69% size reduction); Draco deferred |
| 6 | Validation & Play Store Ready | ⚠️ Partial | 104/104 tests passing; physical device testing outstanding (no hardware) |

---

## 15. Deployment & DevOps

### Local Development
```bash
pnpm install                    # Node deps
cd apps/api && uv sync --all-extras  # Python deps
cp .env.example .env
cd apps/api && uv run python -c "from app.core.security import generate_keys; generate_keys()"
pnpm db:up                      # Docker Compose: Postgres + Redis + MinIO
cd apps/api && uv run alembic upgrade head
pnpm start                      # ./start.sh (infra + web + api + mobile)
```

### Key env vars
- `DATABASE_URL` — PostgreSQL connection
- `JWT_SECRET_KEY` — JWT signing (or RS256 keys)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OLLAMA_BASE_URL` — AI provider (one required unless strict-local)
- `SADTALKER_ENABLED` — Talking-head video (default false)
- `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` (768)
- `PRIVACY_MODE` — strict-local / private-machine / cloud-allowed

### Mobile Release
```bash
cd apps/mobile/android
ANDROID_HOME=/home/manas/Android/Sdk ./gradlew assembleRelease   # Release APK
ANDROID_HOME=/home/manas/Android/Sdk ./gradlew bundleRelease     # Release AAB (Play Store)
```
Production signing keystore required before Play Store submission (currently debug-signed).

---

## 16. Testing Strategy

| Suite | Tool | Coverage | Status |
|-------|------|----------|--------|
| Backend | Pytest | Auth, health, providers, privacy, memory RAG, avatar, chat streaming, voice, sadtalker, multi-user E2E | 204+ tests passing |
| Web | Jest | Studio, chat, voice companion, onboarding | 84 tests passing |
| Web E2E | Playwright | Critical user flows | Configured |
| Mobile | Jest | Auth storage, avatar service, model cache, 2D fallback, renderer | 32 tests passing (5 suites) |

---

## 17. Key Design Decisions & Constraints

1. **Pure Three.js + expo-gl over R3F v9** — R3F v9 requires React 19; project is on React 18 / Expo 51.
2. **Models served by FastAPI `/models`** — Mobile does not depend on Next.js dev server (port 3000).
3. **SadTalker isolated** — Excluded from mobile bundle; non-commercial; disabled by default.
4. **No implicit cloud fallback** — `get_provider()` raises error in strict-local/private-machine if no local provider configured.
5. **Zero-orphan chat semantics** — User + assistant messages committed atomically only after successful inference.
6. **Mobile-first asset optimization** — 1024×1024 WebP textures, ~63–69% smaller than source GLBs.
7. **2D fallback guarantee** — Voice/conversation never interrupted by 3D rendering failures.

---

## 18. Known Limitations & Open Items

- **Physical device testing outstanding**: No Android device or emulator connected (`adb devices` empty).
- **Gradle build in offline env**: Host firewall blocks `services.gradle.org`; release APK built manually.
- **Production signing**: Release currently debug-signed; production keystore needed for Play Store.
- **Mixamo licensing**: Formal sign-off needed on animation redistribution.
- **Draco/Meshopt compression**: Deferred due to sparse morph target warnings; texture optimization done instead.
- **Streaming HTTP endpoint**: Provider `stream()` implemented but not yet exposed via SSE router.
- **Memory extraction**: RAG retrieval implemented; background extraction from turns partially complete (Milestone 2).

---

## 19. How to Onboard a New Agent

1. Read `docs/architecture/local-first-architecture.md` for privacy model and local-first storage.
2. Read this `MASTER_ARCHITECTURE.md` for full system overview.
3. Examine `packages/shared/src/index.ts` for the canonical data contracts.
4. Examine `apps/api/src/app/main.py` for API route mounting and global error handling.
5. Examine `apps/api/src/app/providers/factory.py` for provider selection and privacy enforcement.
6. Check milestone validation reports in repo root (`AVATAR_STUDIO_MILESTONE_*.md`) for implementation status and test results.
7. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` to verify before making changes.
