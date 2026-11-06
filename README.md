# AI Companion

A modular, privacy-first AI companion application with persistent memory, customizable avatars, and cross-platform support.

## Architecture

- **Web**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Mobile**: Expo 51, React Native 0.74, TypeScript, NativeWind
- **API**: FastAPI 0.110, Python 3.12, SQLModel, PostgreSQL + pgvector
- **Shared**: TypeScript types and schemas shared across frontend and backend
- **Monorepo**: Turborepo with pnpm workspaces

## Features (MVP)

1. User registration, login, and logout with JWT authentication
2. Customizable companion with layered 2D avatar
3. Text-based conversations with persistent history
4. Persistent memory with user controls
5. Routine preferences saved automatically
6. Sensitive memories require explicit user approval
7. Users can inspect, correct, and delete memories
8. Strict data isolation between users
9. Responsive web interface
10. Mobile application shell

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

- **Modular Monolith**: Single deployable API with clear internal boundaries
- **Provider Independence**: AI providers behind abstract interfaces
- **Privacy by Design**: Explicit consent for sensitive data, user-controlled deletion
- **Type Safety**: End-to-end TypeScript with shared types
- **Security First**: RS256 JWT, Argon2id password hashing, RLS policies
- **Observability**: Structured logging, OpenTelemetry ready

## License

MIT