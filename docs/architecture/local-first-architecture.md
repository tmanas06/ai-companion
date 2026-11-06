# AI Companion — Local-First Architecture

> **Status**: Proposal · October 2026  
> **Scope**: Desktop-first validation, mobile-compatible design  
> **Constraint**: No AI inference call, no storage write, and no sync operation may be sent to a remote third-party service without explicit user intent in local-only mode.

---

## Table of Contents

1. [Current-State Assessment](#1-current-state-assessment)
2. [Proposed Component Architecture](#2-proposed-component-architecture)
3. [Data-Flow Diagrams](#3-data-flow-diagrams)
4. [Privacy Boundaries and Threat Model](#4-privacy-boundaries-and-threat-model)
5. [Platform-Specific Storage and Inference](#5-platform-specific-storage-and-inference)
6. [Migration Strategy](#6-migration-strategy)
7. [Testing Strategy](#7-testing-strategy)
8. [Risks, Trade-offs, and Unresolved Decisions](#8-risks-trade-offs-and-unresolved-decisions)
9. [Prioritized Implementation Roadmap](#9-prioritized-implementation-roadmap)
10. [Summary and Next Step](#10-summary-and-next-step)

---

## 1. Current-State Assessment

### 1.1 Repository Layout

```
ai-companion/
├── apps/
│   ├── api/          # FastAPI · Python 3.12 · SQLModel/SQLAlchemy
│   ├── mobile/       # Expo 51 / React Native 0.74
│   └── web/          # Next.js 14 (App Router)
├── packages/
│   └── shared/       # 141-line TypeScript type library
└── docker-compose.yml  # PostgreSQL 16 + pgvector, Redis 7, MinIO
```

The monorepo uses pnpm workspaces + Turborepo for the JavaScript apps and uv for Python.

### 1.2 Feature Implementation Status

| Feature | Status | Evidence |
|---|---|---|
| User registration / login (password) | ✅ Implemented | `auth.py` endpoint · argon2 password hashing · RS256 JWT |
| JWT access + refresh token pair | ✅ Implemented | `security.py` · 15 min / 30 day expiry |
| Companion CRUD | ✅ Implemented | `avatar.py` service; `companions` table in migration 002 |
| Conversation CRUD | ✅ Implemented | `conversation.py` service · soft delete · pagination |
| Message persistence | ✅ Implemented | `messages` table · role enum · token counts |
| AI chat (non-streaming) | ✅ Implemented | `ConversationService.chat()` → `BaseProvider.complete()` |
| AI streaming | ⚠️ Partial | `BaseProvider.stream()` defined; no streaming HTTP endpoint exposed |
| Ollama integration | ✅ Implemented | `OllamaProvider` · `/api/chat` · `/api/pull` |
| OpenAI integration | ✅ Implemented | `OpenAIProvider` in `openai_provider.py` |
| Anthropic integration | ✅ Implemented | `AnthropicProvider` in `anthropic_provider.py` |
| Provider selection | ⚠️ Partial | `get_provider()` returns mock when no cloud keys set, not Ollama |
| Memory CRUD + consent | ✅ Implemented | `MemoryService` · `consentStatus` enum · supersede pattern |
| Memory search | ⚠️ Partial | `ilike` text search only; embedding column + HNSW index exist but **no embeddings are ever written** |
| RAG retrieval | ❌ Not implemented | No embedding generation; search is substring match only |
| Avatar config CRUD | ✅ Implemented | `AvatarService` · JSON config · layered system |
| Avatar asset management | ✅ Implemented | `avatar_assets` table · layer/variant unique index |
| Avatar image rendering | ❌ Not implemented | Asset URLs stored; no compositing or canvas renderer |
| OAuth (Google / GitHub / Apple) | ❌ Not implemented | Feature flags exist in config; no routes or token exchange |
| Proactive messages / notifications | ❌ Not implemented | Flag only |
| Voice sessions | ❌ Not implemented | Flag only |
| Sync / backup | ❌ Not implemented | MinIO in docker-compose; no sync service |
| Redis usage | ❌ Not implemented | In infrastructure; no application code uses it |
| Memory extraction from conversation | ❌ Not implemented | Flag exists; no extraction service |
| Audit log writes | ❌ Not implemented | Table and model exist; no writes in any endpoint |

**Mobile app (Expo):** All four tab screens are placeholder scaffolding. None call any API. The home screen incorrectly uses `require('@expo/vector-icons/...')` as an `Image` source — this will render broken images.

**Shared package (`packages/shared`):** 141 lines of TypeScript interfaces. No logic, no validators, no platform adapters.

**Web tests:** 2 passing (root redirect smoke test).  
**API tests:** 22 passing (auth + health). No service-layer or provider tests.  
**Backend coverage:** ~51%, inflated by conftest boilerplate; core services are largely untested.

### 1.3 Critical Gaps vs. Product Vision

1. **No local RAG.** The `embedding` column and HNSW index are present, but nothing populates them.
2. **No memory extraction.** The system prompt is never augmented with retrieved memories before inference.
3. **Privacy mode is unenforced.** `get_provider()` defaults to `MockProvider`, not `OllamaProvider`. A user expecting local-only inference silently receives mock responses.
4. **PostgreSQL + Redis are mandatory.** Every API request depends on a live PostgreSQL connection. No offline path exists.
5. **Mobile is a wireframe.** Zero actual functionality on mobile.
6. **No streaming endpoint.** `stream()` is implemented on providers but never called by any HTTP handler.

---

## 2. Proposed Component Architecture

### 2.1 Guiding Principles

- **One domain model, many storage adapters.** Core entities defined once in shared interfaces; platform adapters implement a common repository interface.
- **Inference is pluggable and privacy-scoped.** An `InferenceAdapter` interface allows swapping providers. A `PrivacyMode` enum governs what the runtime may call.
- **Synchronization is opt-in and explicit.** Data is written locally first. Remote sync is a separate, user-triggered layer behind an explicit capability gate.
- **Embeddings are local.** On desktop, `nomic-embed-text` via Ollama. On mobile (future), a WASM ONNX embedding model. No embedding text is sent to a remote service in local-only mode.

### 2.2 Layered Component Map

```
┌────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  Next.js 14 (Web)           Expo / React Native (Mobile)│
└─────────────────┬──────────────────────┬───────────────┘
                  │                      │
┌─────────────────▼──────────────────────▼───────────────┐
│                   Application Layer                      │
│  ConversationUseCase  MemoryUseCase  AvatarUseCase      │
│  (platform-agnostic TypeScript/Python classes)          │
└──────┬───────────────────────┬────────────────┬─────────┘
       │                       │                │
┌──────▼──────┐   ┌────────────▼───────┐  ┌────▼────────┐
│  Inference  │   │  Memory Repository │  │  Storage    │
│  Adapter   │   │  (w/ vector index) │  │  Adapter   │
│  Interface  │   └────────────────────┘  └─────────────┘
└──────┬──────┘
       │
┌──────▼──────────────────────────────────────────────────┐
│               Infrastructure (platform-specific)         │
│                                                          │
│  Desktop/Server:              Mobile (future):           │
│  • Ollama (inference)         • llama.cpp WASM / MLKit   │
│  • PostgreSQL+pgvector (DB)   • SQLite + sqlite-vec      │
│  • Local filesystem (blobs)   • expo-sqlite              │
│  • nomic-embed-text (embed)   • ONNX WASM embedder       │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Shared Domain Model Extensions

`packages/shared` must grow to include:

```typescript
// packages/shared/src/repositories.ts
export interface ConversationRepository {
  create(data: ConversationCreate): Promise<Conversation>;
  get(id: string): Promise<Conversation | null>;
  list(userId: string, opts: ListOptions): Promise<PagedResult<Conversation>>;
  delete(id: string): Promise<void>;
}

export interface MemoryRepository {
  create(data: MemoryCreate): Promise<Memory>;
  search(query: EmbeddingVector, opts: SearchOptions): Promise<Memory[]>;
  textSearch(q: string, opts: SearchOptions): Promise<Memory[]>;
  updateConsent(id: string, action: 'approve' | 'deny'): Promise<Memory>;
  pendingConsent(userId: string): Promise<Memory[]>;
}

// packages/shared/src/inference.ts
export type PrivacyMode = 'strict-local' | 'private-machine' | 'cloud-allowed';

export interface InferenceAdapter {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  stream(req: CompletionRequest): AsyncGenerator<StreamChunk>;
  embed(text: string): Promise<number[]>;
  availableModels(): Promise<string[]>;
  privacyMode: PrivacyMode;
}

// packages/shared/src/capabilities.ts
export interface PlatformCapabilities {
  inference: 'ollama' | 'llama-cpp-wasm' | 'mlkit' | 'cloud' | 'mock';
  storage: 'postgresql' | 'sqlite' | 'indexeddb' | 'memory';
  embeddings: 'ollama' | 'onnx-wasm' | 'cloud' | 'none';
  sync: 'disabled' | 'user-enabled';
}
```

### 2.4 Privacy Mode / Capability Model

| Mode | Inference | Embeddings | Storage | Sync |
|---|---|---|---|---|
| **strict-local** (on-device) | llama.cpp WASM or MLKit only | ONNX WASM | SQLite / IndexedDB | Disabled |
| **private-machine** | Ollama on same machine | nomic-embed via Ollama | PostgreSQL local or SQLite | Disabled by default |
| **cloud-allowed** | Any registered provider | Any provider | Any | User opt-in |

> **Important**: PostgreSQL + a local Ollama daemon is `private-machine`, not `strict-local`. The UI must never describe this as "on-device" storage.

### 2.5 Memory Pipeline (RAG)

```
User message arrives
        ↓
[Embedding Adapter].embed(user_message)          ← local only in private-machine
        ↓
[MemoryRepository].vector_search(embedding, top_k=5, userId)
  WHERE consent_status IN ('approved', 'auto_approved')
        ↓
Retrieved memories injected into system prompt prefix
        ↓
[InferenceAdapter].complete(augmented_request)   ← Ollama in private-machine
        ↓
Response returned + background memory extraction
        ↓
[MemoryExtractor].extract(conversation_turn)
  → creates Memory rows with consent_status='pending' (if sensitive)
  → embeds and indexes new memories asynchronously
```

### 2.6 Voice Session Interface (Future-Compatible)

```typescript
// packages/shared/src/voice.ts
export interface VoiceSession {
  sessionId: string;
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';
  start(): Promise<void>;
  interrupt(): void;
  end(): Promise<ConversationTurn[]>;
}

export interface VoiceAdapter {
  transcribe(audio: Uint8Array): Promise<string>;         // STT
  synthesize(text: string): AsyncGenerator<Uint8Array>;  // TTS streaming
}
```

---

## 3. Data-Flow Diagrams

### 3.1 Local Chat Turn (private-machine mode)

```mermaid
sequenceDiagram
    participant UI as Next.js / Expo UI
    participant API as FastAPI (local)
    participant Ollama as Ollama (local)
    participant PG as PostgreSQL (local)

    UI->>API: POST /api/v1/conversations/chat {message}
    API->>PG: SELECT companion + recent messages
    API->>Ollama: POST /api/embeddings {user_message}
    Ollama-->>API: embedding vector [768-dim]
    API->>PG: SELECT memories WHERE embedding ≈ vector (HNSW cosine)
    Note over API: Build system prompt + memory context
    API->>Ollama: POST /api/chat {messages, stream:true}
    Ollama-->>API: token stream
    API-->>UI: SSE token stream (Milestone 3) / full response (current)
    API->>PG: INSERT message rows (user + assistant)
    API-)PG: Background: INSERT memory candidates (pending consent if sensitive)
```

### 3.2 Memory Consent Flow

```mermaid
stateDiagram-v2
    [*] --> pending : Memory extracted (is_sensitive=true)
    [*] --> auto_approved : Memory extracted (is_sensitive=false)
    pending --> approved : User approves\nPOST /memories/{id}/consent
    pending --> denied : User denies\n(soft-deleted)
    approved --> superseded : User corrects fact\nPOST /memories/{id}/supersede
    superseded --> [*] : Old memory deleted_at set
    auto_approved --> [*]
    denied --> [*]
```

### 3.3 Local-First Data Ownership

```mermaid
graph TD
    subgraph "User Machine (private-machine)"
        PG[(PostgreSQL + pgvector)]
        OLLAMA[Ollama daemon]
        FS[Local filesystem\nassets / avatars]
    end

    subgraph "User Browser / App"
        WEB[Next.js]
        MOB[Expo RN]
    end

    subgraph "External opt-in only"
        CLOUD[OpenAI / Anthropic\nCloud inference]
        SYNC[Remote sync\nbackup service]
    end

    WEB -->|loopback| PG
    WEB -->|loopback| OLLAMA
    MOB -->|LAN or loopback| PG
    MOB -->|LAN or loopback| OLLAMA
    PG -. "user-enabled sync" .-> SYNC
    WEB -. "cloud-allowed mode only" .-> CLOUD

    style CLOUD stroke:#f00,stroke-dasharray: 5 5
    style SYNC stroke:#f00,stroke-dasharray: 5 5
```

### 3.4 Platform Storage Decision Tree

```mermaid
flowchart TD
    A{Platform?} --> B[Desktop / Server]
    A --> C[Web Browser standalone]
    A --> D[Mobile iOS/Android]

    B --> B1{PostgreSQL available?}
    B1 -->|yes| B2[PostgreSQL + pgvector\nprivate-machine mode]
    B1 -->|no| B3[SQLite + sqlite-vec\nstrict-local mode]

    C --> C1[IndexedDB via dexie.js\nstrict-local mode]

    D --> D1[expo-sqlite + sqlite-vec\nstrict-local mode]
```

---

## 4. Privacy Boundaries and Threat Model

### 4.1 Trust Zones

| Zone | Contents | Trust Level |
|---|---|---|
| User's local machine | PostgreSQL, Ollama, API process, browser | Trusted |
| User's browser sandbox | Next.js, IndexedDB, WebCrypto | Trusted (sandboxed from OS) |
| Mobile app sandbox | expo-sqlite, MLKit, on-device model | Trusted |
| LAN / loopback | API ↔ Ollama, mobile ↔ local API | Trusted (user's network) |
| External API endpoints | OpenAI, Anthropic, Google | Untrusted — requires explicit consent |
| Sync / backup service | Remote storage | Untrusted — opt-in only |

### 4.2 Privacy Requirements Mapping

| Requirement | Current State | Required Change |
|---|---|---|
| Private conversations stay local | ⚠️ Possible if Ollama configured, but unenforced | Enforce `PrivacyMode` check before any provider call |
| No automatic fallback to cloud inference | ❌ `get_provider()` returns mock silently | Replace factory fallback with explicit error |
| Sync disabled by default | ✅ No sync code exists | Maintain; add `SyncAdapter` behind feature gate |
| Google sign-in ≠ Drive access | ✅ OAuth not implemented yet | Request only `openid profile email` when implementing |
| Sensitive memories require consent | ✅ `consent_status=pending` on `is_sensitive=true` | RAG query must filter `WHERE consent_status IN ('approved','auto_approved')` |
| Users can inspect and delete memories | ✅ API exists | Add JSON export capability |
| Strict on-device vs. private-machine distinction | ❌ Not communicated | Surface `PrivacyMode` in settings UI |
| Remote PostgreSQL/Ollama ≠ on-device | ❌ Not addressed | Never use phrase "on-device" for daemon-based storage |

### 4.3 Threat Model

**T1 – Accidental cloud disclosure**: User expects local mode; API silently calls OpenAI because `OPENAI_API_KEY` is set.  
*Mitigation*: `PrivacyMode.PRIVATE_MACHINE` blocks cloud providers at factory level; error is raised.

**T2 – Sensitive memory used before consent**: Memory injected into next prompt before user approves.  
*Mitigation*: RAG query: `WHERE consent_status IN ('approved', 'auto_approved')`.

**T3 – Sync exfiltrates private data**: User enables sync without understanding what is uploaded.  
*Mitigation*: Explicit consent screen; client-side encryption before upload.

**T4 – OAuth grants excessive scope**: Future Google sign-in requests Drive access.  
*Mitigation*: Request only `openid profile email`; never request resource scopes implicitly.

**T5 – Embedding text leaked to cloud**: Embedding generated via OpenAI in private-machine mode.  
*Mitigation*: `EmbeddingAdapter` checks `PrivacyMode`; only Ollama embed endpoint allowed in non-cloud modes.

---

## 5. Platform-Specific Storage and Inference

### 5.1 Desktop (validated first)

**Database: PostgreSQL 16 + pgvector**
- Already in docker-compose. HNSW index on `memories.embedding` in migration 002.
- Suitable for development and single-user desktop deployment.
- **Not on-device storage** — it is a separate daemon process.

**Embeddings: Ollama `nomic-embed-text` (768-dim)**
- `POST /api/embeddings {model: "nomic-embed-text", prompt: text}` → 768-dim vector.
- No text leaves the machine.
- **⚠️ Dimension mismatch**: Current schema defines `Vector(1536)`. Migration 003 must change this to `Vector(768)`.

**Inference: Ollama with llama3.1:8b (default)**
- Already implemented in `OllamaProvider`. Works for non-streaming.
- Streaming requires a Server-Sent Events endpoint.

**Blob storage: Local filesystem (private-machine) / MinIO (multi-user)**
- Avatar assets stored with MinIO URLs. Add a `LocalFilesystemBlobAdapter` for private-machine mode.

### 5.2 Browser Standalone (future)

**Database: IndexedDB via Dexie.js / PGlite**
- No native vector ANN available.
- Options: usearch.js (WASM HNSW, ~5 MB) or PGlite (full PostgreSQL WASM, ~11 MB gzip).
- **Defer this decision until desktop validation is complete.**

**Inference: WebLLM / llama.cpp WASM**
- Requires WebGPU; not universally available.
- **Not needed for desktop validation.** Design `InferenceAdapter` to accommodate this path.

### 5.3 Mobile (Expo / React Native)

**Near-term**: Mobile app connects to the local FastAPI instance over LAN. No on-device inference.

**Future**:
- Database: `expo-sqlite` v14+ (async SQLite on iOS/Android)
- Vector search: `sqlite-vec` extension (early) or `oramasearch` (JS-native ANN, memory-resident)
- Inference: llama.cpp on iOS via `llama.rn`, or MLKit
- Embeddings: ONNX Runtime React Native with all-MiniLM-L6-v2 (22 MB)

**Critical**: Near-term (LAN API) and future (on-device) paths have very different latency, model size, and capability profiles. The `InferenceAdapter` interface must accommodate both.

### 5.4 Embedding Dimension Decision

Current `memories.embedding` is `Vector(1536)` (OpenAI ada-002 dimension).

| Model | Dimension | Local? | Quality |
|---|---|---|---|
| OpenAI text-embedding-ada-002 | 1536 | ❌ Cloud | Excellent |
| nomic-embed-text (Ollama) | 768 | ✅ | Very good |
| all-MiniLM-L6-v2 (ONNX) | 384 | ✅ | Good |

**Recommendation**: Migrate to `Vector(768)` for `nomic-embed-text`. Cloud-allowed mode may use a separate embedding model. Migration 003 must drop and recreate the HNSW index.

---

## 6. Migration Strategy

### Phase 0 — Local Inference Integrity (no breaking changes)

1. Fix `get_provider()` to return `OllamaProvider` when Ollama is configured and no cloud keys are set.
2. Add `PRIVACY_MODE` config; enforce at factory level.
3. Fix `get_available_models()` to query Ollama live (`GET /api/tags`) rather than a hard-coded list.
4. Auto-provision default companion on user registration.

### Phase 1 — Embedding + RAG Pipeline

5. Migration 003: alter `memories.embedding` to `Vector(768)`.
6. Implement `embed()` in `OllamaProvider` using `nomic-embed-text`.
7. Background embedding task on memory create.
8. Replace `ilike` search with pgvector cosine similarity.
9. Inject retrieved memories into system prompt before inference.
10. Streaming SSE endpoint.

### Phase 2 — Memory Extraction

11. `MemoryExtractor` service: calls LLM with extraction prompt after each conversation turn.
12. Creates new memory rows; sensitive ones start `consent_status=pending`.
13. Web UI consent review screen.

### Phase 3 — Storage Abstraction

14. Define `StorageAdapter` interface in `packages/shared`.
15. Implement `PostgreSQLAdapter` (wraps existing services).
16. Implement `SQLiteAdapter` (for future desktop-without-Docker and mobile).
17. `BlobAdapter` interface with `LocalFilesystem` and `S3` implementations.

### Phase 4 — Mobile Foundation

18. Fix mobile icon rendering.
19. Auth screens, chat screen, memories screen in Expo app.
20. LAN endpoint configuration in settings.
21. `expo-sqlite` adapter for offline mobile.

### Phase 5 — Sync and Backup (opt-in)

22. `SyncAdapter` interface with `DisabledSyncAdapter` as default.
23. Client-side encryption before upload.
24. Explicit consent screen before enabling sync.

---

## 7. Testing Strategy

### 7.1 Current Coverage Analysis

| Area | Tests | Gap |
|---|---|---|
| Auth endpoints | 20 | Missing: invalid/expired tokens, OAuth |
| Health endpoint | 2 | Adequate |
| Conversation service | 0 | Entire service untested |
| Memory service | 0 | Consent flow untested |
| Avatar service | 0 | Untested |
| Provider abstraction | 0 | All three providers untested |
| Embedding pipeline | 0 | Does not exist yet |
| RAG retrieval | 0 | Does not exist yet |
| Web UI | 2 | Chat, memory, companion pages untested |
| Mobile | 0 | Entire app |

### 7.2 Test Layers

**Unit tests (no DB)**
- `MemoryService` with mock `AsyncSession`
- `ConversationService.chat()` with mock `BaseProvider`
- Privacy mode enforcement in factory

**Integration tests (live PostgreSQL via testcontainers)**
- Full auth flow
- Chat → memory extraction → consent → RAG retrieval
- Vector similarity search returns expected memories

**Contract tests**
- JSON Schema validation: API responses match `packages/shared` TypeScript interfaces
- Run in CI as part of the build step

**End-to-end tests (Playwright)**
- Register → login → create companion → chat → review memories → approve consent

**Provider tests (marked `@pytest.mark.integration`)**
- `OllamaProvider.complete()` against a real Ollama instance
- Skip in CI unless `OLLAMA_TEST_URL` is set

### 7.3 Coverage Targets

| Area | Target |
|---|---|
| API services (conversation, memory, avatar) | ≥ 80% |
| Privacy mode enforcement | 100% branch |
| Embedding pipeline | ≥ 90% |
| Provider factory | 100% |
| Auth endpoints | ≥ 90% |
| Web UI (critical paths) | ≥ 60% |

---

## 8. Risks, Trade-offs, and Unresolved Decisions

### 8.1 Unresolved Decisions

**U1 — Embedding dimension**  
`Vector(1536)` vs. `Vector(768)`. Must be resolved before any embedding writes. Low-risk to change now (no stored embeddings); high-risk later.  
*Recommendation*: 768 (nomic-embed-text).

**U2 — Memory extraction prompt strategy**  
Separate smaller model (phi3:mini) vs. structured output from the main model vs. tool-call pattern. Affects quality, latency, and model requirements.

**U3 — Companion auto-provisioning**  
New users cannot chat without a companion. Auto-create a default companion on registration, or require explicit creation?  
*Recommendation*: Auto-create on registration with sensible defaults; allow customisation later.

**U4 — Mobile vector storage**  
`sqlite-vec` (early development) vs. oramasearch (memory-resident JS). Neither is production-ready.  
*Can wait until Phase 4.*

**U5 — Streaming transport**  
SSE (simple, HTTP/1.1) vs. WebSocket (needed for bidirectional voice).  
*Recommendation*: SSE for text chat now; WebSocket for voice as a separate future endpoint.

**U6 — Blob storage path for local avatars**  
MinIO requires a daemon. `LocalFilesystemBlobAdapter` must store paths that are stable across restarts.

### 8.2 Known Technical Risks

**R1 — `get_provider()` global mutable state**  
Module-level global mutated by `initialize_default_providers()`. Not thread-safe in async contexts; makes testing difficult.  
*Mitigation*: Per-request dependency injection via `Depends(get_provider_from_request)`.

**R2 — `get_available_models()` is a hard-coded list**  
User-installed Ollama models not in the list appear unavailable. `_ensure_model()` attempts to pull unknown models — unexpected network activity.  
*Mitigation*: Replace with a live `GET /api/tags` call.

**R3 — Mobile icon rendering is broken**  
`require('@expo/vector-icons/...')` used as `Image source` — this does not render icons.

**R4 — No companion on fresh user registration**  
`newConversationCompanionId` defaults to `""` when the companion list is empty; "Create" button is permanently disabled with no explanation.

**R5 — Redis is in the stack but unused**  
Creates an impression of robustness (rate-limiting, session revocation) that does not exist.

**R6 — Tests depend on a live PostgreSQL**  
`conftest.py` hardcodes `postgresql://localhost`. CI spins up a service container, but local development without Docker silently fails.  
*Mitigation*: Add testcontainers support or a clear prerequisite check.

**R7 — Companion model `llm_config` vs. shared schema**  
The database model calls the field `llm_config`; `packages/shared` calls the equivalent field `modelConfig`. This inconsistency will cause serialisation bugs when shared types are used on the mobile app.

**R8 — Memory extraction creates a feedback loop risk**  
If the extraction LLM hallucinates facts from a conversation, those facts are stored as memories and influence future responses. There is no correction mechanism beyond the `supersede` pattern.

---

## 9. Prioritized Implementation Roadmap

### Milestone 0 — Local Inference Integrity (✅ Implemented · October 2026)

**Goal**: User with Ollama gets real AI responses; no silent mock fallback; no cloud calls in private-machine mode.

| Task | Status | Implementation Detail |
|---|---|---|
| Fix provider default: Ollama when configured, error otherwise | ✅ Implemented | In `strict-local` and `private-machine`, resolves `OllamaProvider`. Never falls back to `MockProvider`. |
| Add `PRIVACY_MODE` config; enforce in factory | ✅ Implemented | `PRIVACY_MODE` in `Settings` (`strict-local`, `private-machine`, `cloud-allowed`). Validated at config load time. |
| Global privacy enforcement | ✅ Implemented | `validate_provider_privacy()` blocks cloud providers and remote endpoints before prompts are sent. |
| Companion preference integration | ✅ Implemented | `ConversationService.chat()` checks `companion.llm_config["provider"]`. Global privacy mode overrides companion preferences. |
| Remove unprompted model downloads | ✅ Implemented | `_ensure_model()` in `OllamaProvider` queries `/api/tags` and raises `ProviderConfigurationError` on missing models instead of calling `/api/pull`. |
| Remove duplicate AnthropicProvider | ✅ Implemented | Removed duplicate in `openai_provider.py`; canonical import from `anthropic_provider.py`. |
| Typed error responses | ✅ Implemented | `PrivacyViolationError` (HTTP 403) and `ProviderConfigurationError` (HTTP 503) registered in FastAPI. |
| Provider & privacy test suite | ✅ Implemented | 21 dedicated unit & integration tests in `apps/api/tests/test_providers.py` covering all 19 privacy/selection scenarios. |

### Milestone 0.1 — State Integrity & Hardening (✅ Implemented · October 2026)

**Goal**: Eliminate orphaned user messages on provider/inference failures, unify API error schemas via global exception handlers, harden `strict-local` against DNS rebinding, and safeguard cloud provider network error paths.

| Task | Status | Implementation Detail |
|---|---|---|
| Atomic chat message persistence | ✅ Implemented | `ConversationService.chat()` authorizes and validates privacy & provider configuration upfront before any DB write; persists both user and assistant messages atomically only after successful inference. |
| Centralized API error handling | ✅ Implemented | Removed local catch-and-rethrow `HTTPException` conversion from `endpoints/conversation.py`. Unhandled `PrivacyViolationError` and `ProviderConfigurationError` bubble directly to FastAPI global handlers in `main.py`. |
| `strict-local` URL hardening | ✅ Implemented | `is_loopback_endpoint()` rejects arbitrary DNS hostnames (mitigating DNS rebinding / TOCTOU), credentials, non-HTTP/HTTPS schemes, and non-loopback IPs; permits only literal `localhost` and loopback IP literals (`127.0.0.0/8`, `::1`). |
| Cloud provider network error mapping | ✅ Implemented | `OpenAIProvider` and `AnthropicProvider` translate `httpx.ConnectError`, `httpx.HTTPStatusError`, and `httpx.HTTPError` into `ProviderConfigurationError` without leaking API keys or user prompts. |
| Database state integrity test suite | ✅ Implemented | Added 10 regression tests in `test_providers.py` (total 31 tests) validating DB zero-orphan state, message count consistency, history preservation, idempotent retry behavior, and global error schemas. |

---

## 10. Privacy Semantics, Guarantees, and Current Architecture Status

### 10.1 Privacy Mode Semantics

1. **`strict-local`**:
   - **Allowed Providers**: Local on-device inference only.
   - **Locality Verification**: Checks `is_loopback_endpoint()`. Accepts only RFC-standard loopback IP literals (`127.0.0.0/8`, `::1`) and the literal hostname `localhost`. Arbitrary DNS names (including `.local`, `*.internal`, or custom local DNS domains) are strictly rejected to prevent DNS rebinding and TOCTOU attacks.
   - **Rejections**: Hosted cloud providers (`OpenAI`, `Anthropic`), remote Ollama URLs, and URLs with user credentials (`user:pass@`) raise `PrivacyViolationError`.
   - **Fail-Closed Behavior**: Unresolvable hosts or unverifiable network endpoints raise `PrivacyViolationError`.
   - **Boundary Note**: Loopback hostname verification on a remote server only confirms local loopback on that server, not execution on the end-user's device. True on-device client execution will be achieved via client-side WASM/MLKit in future milestones.

2. **`private-machine` (Default)**:
   - **Allowed Providers**: Ollama (on localhost or a user-managed private server / LAN machine).
   - **User-Managed Endpoints**: Permits explicit IP addresses or hostnames specified in `OLLAMA_BASE_URL` (e.g. `http://192.168.1.50:11434` or `http://ollama-server:11434`), preserving the ability to connect to a user's dedicated Ollama machine.
   - **Rejections**: Hosted cloud providers (`OpenAI`, `Anthropic`) raise `PrivacyViolationError` before any prompt, conversation history, or user data is accessed.
   - **Fail-Closed Behavior**: If Ollama is unconfigured or unavailable, raises `ProviderConfigurationError` (HTTP 503) without attempting any cloud fallback.

3. **`cloud-allowed`**:
   - **Allowed Providers**: Any registered provider (`ollama`, `openai`, `anthropic`).
   - **Explicit Selection Required**: Cloud providers are **never** selected automatically simply because an API key exists in the environment. An explicit provider choice via companion configuration or `DEFAULT_PROVIDER` is strictly required.

### 10.2 Provider Selection Precedence

1. **Companion Preference**: If `companion.llm_config.get("provider")` is set, `get_provider(provider_type)` is invoked.
2. **Global Policy Validation**: The requested provider is evaluated against `PRIVACY_MODE`. If prohibited, `PrivacyViolationError` is raised immediately.
3. **Explicit Default**: If no companion preference is specified, `DEFAULT_PROVIDER` in settings is evaluated.
4. **Fallback Default**:
   - In `strict-local` and `private-machine`: Defaults to `"ollama"`.
   - In `cloud-allowed`: Raises `ProviderConfigurationError` requiring explicit configuration.
5. **Mock Mode**: `MockProvider` is only available in non-production environments (`ENVIRONMENT != "production"`) when explicitly requested (`provider_type="mock"` or `DEFAULT_PROVIDER="mock"`). It is **never** an implicit production fallback.

### 10.3 Model Download & Availability Policy

- Chat and inference requests **never** trigger model downloads.
- If a requested model is not present in Ollama's local tags, `ProviderConfigurationError` is raised with instructions to pull the model manually (`ollama pull <model>`).
- If Ollama is down or unreachable, a `ProviderConfigurationError` is raised immediately; the system never retries with a cloud provider.

### 10.4 Chat Persistence and Failure Semantics

To guarantee conversation integrity and prevent orphaned messages:
1. **Upfront Authorization and Policy Enforcement**: `ConversationService.chat()` first authorizes the user against the companion and conversation, resolves the provider, validates privacy policies, and verifies model availability before executing any database write.
2. **Atomic Post-Inference Commitment**: The incoming user message and the generated assistant response are added and committed to the database in a single transaction only **after** inference successfully returns.
3. **Zero-Orphan Invariant**: If provider resolution, privacy validation, network connectivity, or LLM completion fails:
   - Neither the user message nor the assistant response is written to the database.
   - Existing conversation messages are completely untouched.
   - `conversation.message_count` remains strictly equal to the number of persisted messages.
4. **Clean Retry Semantics**: When a client retries a previously failed chat turn, no duplicate user message exists in the database; the turn begins cleanly and records exactly one user message and one assistant message on success.

### 10.5 Centralized API Error Response Formats

Global exception handlers in `apps/api/src/app/main.py` serve as the single source of truth for operational error schemas:
- **`PrivacyViolationError`**: Returns HTTP 403 with body:
  ```json
  {
    "detail": "<error message>",
    "error_type": "privacy_violation"
  }
  ```
- **`ProviderConfigurationError`**: Returns HTTP 503 with body:
  ```json
  {
    "detail": "<error message>",
    "error_type": "provider_configuration_error"
  }
  ```
Local endpoints must never intercept these exceptions with catch-and-rethrow `HTTPException` wrappers, preserving the structured `error_type` for client deserialization and error UI handling.

### 10.6 strict-local Endpoint Hardening & Anti-DNS Rebinding

To eliminate DNS-rebinding and TOCTOU vulnerabilities:
- `is_loopback_endpoint()` validates URLs by parsing scheme, host, and port via `urllib.parse.urlsplit`.
- Supported schemes are strictly `http` and `https`.
- URLs containing user credentials (`user:pass@host`) are rejected unconditionally.
- Arbitrary domain names are rejected. No DNS resolution is performed during verification.
- Only exact string literals `localhost` and validated IP literals in the IPv4 loopback range (`127.0.0.0/8`) or IPv6 loopback (`::1`) are accepted.
- In `private-machine` mode, user-configured LAN or server endpoints (e.g. `http://192.168.1.100:11434`) remain supported.

### 10.7 Remaining DNS, Networking, Concurrency, and Deployment Limitations

1. **Host-Level Loopback vs. Client Device**: A loopback address (`127.0.0.1`) on a server running `apps/api` refers to the server host's loopback interface, not the client's laptop or mobile phone. True user-device execution requires on-device WebAssembly or native mobile models (Milestone 4).
2. **Concurrent Request Serialization**: Currently, `conversation.message_count` is incremented in memory before commit. If two concurrent requests arrive for the exact same conversation, an optimistic lock or database-level lock (`SELECT ... FOR UPDATE`) is not currently held across the inference phase to avoid connection pool exhaustion. A serial queue or DB-level sequence should be introduced if concurrent multi-client turns for the same companion become a requirement.
3. **Streaming Endpoint**: Streaming (`stream()`) is implemented across providers but is not yet exposed via an SSE router in FastAPI.
4. **Embedding & RAG Pipeline**: The `embedding` column on `memories` exists with an HNSW index, but embeddings are not yet generated or searched (Milestone 1).

### 10.8 Next Implementation Step

**Milestone 1 — Embedding + Vector RAG**:
1. Implement local embedding generation (`OllamaProvider.embed()` using `nomic-embed-text`).
2. Update schema dimension if necessary (`Vector(768)`).
3. Implement semantic search in `MemoryService.search_memories()`.
4. Inject retrieved memories into system prompt before inference.
