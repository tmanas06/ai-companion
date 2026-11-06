# AI Companion API

FastAPI backend for the AI Companion application.

## Quick Start

### Prerequisites

- Python 3.12+
- uv (recommended) or pip
- PostgreSQL 16+ with pgvector extension
- Redis (optional, for background jobs)

### Installation

```bash
# Using uv (recommended)
uv sync --all-extras

# Or using pip
pip install -e ".[dev]"
```

### Development

```bash
# Generate JWT keys (first time only)
uv run python -c "from app.core.security import generate_keys; generate_keys()"

# Run database migrations
uv run alembic upgrade head

# Start development server
uv run fastapi dev src/app/main.py
```

The API will be available at `http://localhost:8000` with docs at `http://localhost:8000/docs`.

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp ../.env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET_KEY` - Secret for JWT signing (or use RS256 with key files)

### Testing

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=src --cov-report=html
```

### Linting & Type Checking

```bash
# Lint
uv run ruff check src tests

# Format
uv run ruff format src tests

# Type check
uv run mypy src
```

### Project Structure

```
src/app/
├── main.py              # FastAPI application factory
├── api/
│   └── v1/              # API v1 endpoints
│       ├── router.py    # Main router
│       └── endpoints/   # Route handlers
├── core/                # Core configuration
│   ├── config.py        # Settings management
│   ├── database.py      # Database connection
│   ├── security.py      # JWT, password hashing
│   └── logging.py       # Structured logging
├── models/              # SQLModel models
├── schemas/             # Pydantic schemas
├── services/            # Business logic
└── repositories/        # Data access layer
```

### Database Migrations

```bash
# Create new migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Rollback
uv run alembic downgrade -1
```