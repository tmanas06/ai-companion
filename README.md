# AETHRA

A modular, privacy-first AI companion with persistent memory, customizable avatars, and cross-platform support.

## Architecture

- **Web**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Mobile**: Expo 51, React Native 0.74, TypeScript, NativeWind.
  Hybrid on-device AI via `llama.rn` + `whisper.rn` + SQLite vector store,
  with optional fallback to the LAN backend. See
  [`docs/MOBILE.md`](docs/MOBILE.md).
- **API**: FastAPI 0.110, Python 3.12, SQLModel, PostgreSQL + pgvector.
  Providers: Ollama (local), OpenAI, Anthropic, 0G Router (for blockchain-aware chat).
- **Shared**: TypeScript types and schemas shared across frontend and backend
- **Monorepo**: Turborepo with pnpm workspaces

For a summary of recent work (backend fixes, AETHRA rebrand, M1-M4 mobile,
canned replies) see [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Features

1. User registration, login, and logout with JWT authentication
2. Customizable companion with layered 2D avatar + photorealistic + 3D modes
3. Text and voice conversations with persistent history
4. Persistent memory with user controls — sensitive memories require consent
5. Users can inspect, correct, and delete memories
6. Strict data isolation between users; privacy modes: strict-local, private-machine, hosted-cloud
7. **Hybrid on-device AI (mobile)** — 3B chat model + Nomic embeddings + Whisper STT running entirely on the phone
8. **Canned replies** for pleasantries so "hi", "thanks", etc. answer in 0 ms
9. **Smart auto-routing** between on-device and LAN based on message intent
10. **0G blockchain-aware chat** — balance lookups and wallet grounding when a wallet is linked
11. **LAN-local backend architecture** — your AI stays on your own machine

## Quick Start

### Prerequisites

- Node.js 20+ and pnpm 9+
- Python 3.12+ and uv
- Docker and Docker Compose
- PostgreSQL 16+ with pgvector (via Docker)

### Installation

```bash
# Clone and navigate
cd ai-companion

# Install Node.js dependencies
pnpm install

# Install Python dependencies
cd apps/api && uv sync --all-extras && cd ../..

# Copy environment file
cp .env.example .env

# Generate JWT keys
mkdir -p apps/api/keys
cd apps/api && uv run python -c "from app.core.security import generate_keys; generate_keys()" && cd ../..

# Start infrastructure
pnpm db:up

# Run database migrations
cd apps/api && uv run alembic upgrade head && cd ../..
```

### Development

Start the entire project (Docker infrastructure, database migrations, Web frontend, and FastAPI backend) with a single command:

```bash
pnpm start
# or
./start.sh
```

Available startup options:

```bash
# Start Web + API + Mobile (Expo) development servers:
pnpm dev:all
# or: ./start.sh --all

# Start only Docker infrastructure (PostgreSQL, Redis, MinIO) & run migrations:
pnpm dev:infra
# or: ./start.sh --infra-only

# Stop Docker infrastructure containers:
./start.sh --down

# Or start services individually:
pnpm dev:web     # Web (Next.js):     http://localhost:3000
pnpm dev:api     # API (FastAPI):     http://localhost:8000
pnpm dev:mobile  # Mobile (Expo):     Metro bundler
```

### Mobile (Expo + hybrid on-device AI)

The mobile app runs AI **on the phone itself** (3B chat model via `llama.rn`,
Nomic embeddings for on-device RAG, Whisper via `whisper.rn` for voice input)
with an optional fallback to the FastAPI backend on your laptop. No cloud.

Full mobile documentation — architecture, APK build, routing policy,
model catalog, troubleshooting — lives in **[`docs/MOBILE.md`](docs/MOBILE.md)**.

Quick start:

```bash
# 1. Run the backend (optional — only needed for the LAN fallback + 0G blockchain)
pnpm dev:api                          # FastAPI on 0.0.0.0:8000

# 2. Build the APK (requires native rebuild for llama.rn / whisper.rn)
cd apps/mobile
pnpm install
npx expo prebuild --clean
pnpm build:apk                        # EAS cloud build → downloadable .apk
# or for local dev client:
npx expo run:android
```

On first launch, open Settings → download a chat model (Qwen2.5-3B default,
~2 GB), optionally an embedding model (Nomic, ~90 MB) and a Whisper model
(~32 MB), and set the AI source to `Auto`, `On-device`, or `Laptop (LAN)`.

### Database

```bash
# Start database
pnpm db:up

# Stop database
pnpm db:down

# View logs
pnpm db:logs

# Reset database (destroys data)
pnpm db:reset

# Create migration
cd apps/api && uv run alembic revision --autogenerate -m "description"

# Apply migrations
cd apps/api && uv run alembic upgrade head
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific app tests
cd apps/web && pnpm test
cd apps/mobile && pnpm test
cd apps/api && uv run pytest
```

### Linting & Formatting

```bash
# Lint all
pnpm lint

# Type check all
pnpm typecheck

# Format all
pnpm format
```

## Project Structure

```
ai-companion/
├── apps/
│   ├── web/                 # Next.js web application
│   │   ├── src/
│   │   │   ├── app/         # App Router pages & API routes
│   │   │   ├── components/  # React components
│   │   │   └── lib/         # Utilities
│   │   └── package.json
│   │
│   ├── mobile/              # Expo React Native application
│   │   ├── app/             # Expo Router screens
│   │   ├── src/             # Shared React Native code
│   │   └── package.json
│   │
│   └── api/                 # FastAPI backend
│       ├── src/
│       │   ├── app/         # FastAPI application
│       │   ├── api/v1/      # API v1 endpoints
│       │   ├── core/        # Config, database, security
│       │   ├── models/      # SQLModel models
│       │   ├── schemas/     # Pydantic schemas
│       │   ├── services/    # Business logic
│       │   └── repositories/# Data access
│       ├── tests/           # Pytest tests
│       ├── alembic/         # Database migrations
│       └── pyproject.toml
│
├── packages/
│   └── shared/              # Shared TypeScript types
│       └── src/
│
├── docker-compose.yml       # Development infrastructure
├── .env.example             # Environment template
├── turbo.json               # Turborepo config
├── package.json             # Root workspace config
└── pnpm-workspace.yaml      # pnpm workspace config
```

## Environment Variables

See `.env.example` for all available variables. Key variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET_KEY` | JWT signing secret (or use RS256 keys) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | One of |
| `ANTHROPIC_API_KEY` | Anthropic API key | One of |
| `OLLAMA_BASE_URL` | Local Ollama endpoint | One of |

## API Documentation

Once the API is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Key Design Decisions

- **Privacy by Design**: AI runs on hardware you control — your laptop
  (backend) and your phone (hybrid on-device). Cloud providers are opt-in
  and gated by a global `PRIVACY_MODE` setting.
- **Hybrid Mobile AI**: 80% of mobile chat turns answered on-device; LAN
  fallback for complex requests or blockchain features that need the network.
  See [`docs/MOBILE.md`](docs/MOBILE.md).
- **Canned Short-Circuit**: Pleasantries skip the LLM entirely for 0 ms replies.
- **Modular Monolith**: Single deployable API with clear internal boundaries
- **Provider Independence**: AI providers behind abstract interfaces
  (Ollama, OpenAI, Anthropic, 0G Router).
- **Type Safety**: End-to-end TypeScript with shared types
- **Security First**: RS256 JWT, Argon2id password hashing, RLS policies
- **Observability**: Structured logging, OpenTelemetry ready

## Documentation

- [`docs/MOBILE.md`](docs/MOBILE.md) — mobile architecture, APK build, model
  catalog, troubleshooting
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — recent work summary (M1-M4,
  canned, backend fixes, rebrand)
- `docs/architecture/` — original architecture notes
- `docs/AVATAR_STUDIO_*.md` — avatar studio plans and license audits

## License

MIT