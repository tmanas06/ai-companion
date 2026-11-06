#!/usr/bin/env bash

# ==============================================================================
# AI Companion - Full Project Startup Script
# Starts Infrastructure (Postgres, Redis, MinIO), runs migrations,
# and starts the Web frontend and FastAPI backend dev servers.
# ==============================================================================

set -eo pipefail

# ANSI Colors
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

print_header() {
    echo -e "${CYAN}${BOLD}"
    echo "============================================================"
    echo "                AI COMPANION - STARTUP                     "
    echo "============================================================"
    echo -e "${RESET}"
}

print_help() {
    echo -e "${BOLD}Usage:${RESET} ./start.sh [options]"
    echo ""
    echo -e "${BOLD}Options:${RESET}"
    echo "  --all, --mobile    Start Web, API, and Mobile (Expo) development servers"
    echo "  --api-only         Start only the FastAPI backend (and infrastructure)"
    echo "  --web-only         Start only the Next.js web app (and infrastructure)"
    echo "  --infra-only       Start only Docker infrastructure (Postgres, Redis, MinIO) & run migrations"
    echo "  --down             Stop all running Docker infrastructure containers"
    echo "  --help, -h         Show this help message"
    echo ""
}

# Parse options
MODE="web_api"
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    print_help
    exit 0
elif [[ "$1" == "--down" ]]; then
    echo -e "${YELLOW}Stopping Docker containers...${RESET}"
    docker compose down
    echo -e "${GREEN}Docker containers stopped.${RESET}"
    exit 0
elif [[ "$1" == "--all" || "$1" == "--mobile" ]]; then
    MODE="all"
elif [[ "$1" == "--api-only" ]]; then
    MODE="api_only"
elif [[ "$1" == "--web-only" ]]; then
    MODE="web_only"
elif [[ "$1" == "--infra-only" ]]; then
    MODE="infra_only"
fi

print_header

# ------------------------------------------------------------------------------
# 1. Check Prerequisites
# ------------------------------------------------------------------------------
echo -e "${BOLD}[1/5] Checking prerequisites...${RESET}"

check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: '$1' is required but not installed or not in PATH.${RESET}"
        echo -e "${YELLOW}$2${RESET}"
        exit 1
    fi
}

check_cmd "docker" "Please install Docker and ensure the Docker daemon is running."
check_cmd "node" "Please install Node.js 20+."
check_cmd "pnpm" "Please install pnpm: npm install -g pnpm"
check_cmd "uv" "Please install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"

# Verify Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running. Please start Docker first.${RESET}"
    exit 1
fi
echo -e "${GREEN}✓ Prerequisites verified (docker, node, pnpm, uv).${RESET}"

# ------------------------------------------------------------------------------
# 2. Environment & Key Configuration
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[2/5] Checking environment & JWT security keys...${RESET}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating root .env from .env.example...${RESET}"
    cp .env.example .env
fi

if [ ! -f "apps/api/.env" ]; then
    echo -e "${YELLOW}Creating apps/api/.env from root .env...${RESET}"
    cp .env apps/api/.env
fi

# Ensure JWT RS256 keys exist
mkdir -p keys apps/api/keys

if [ ! -f "keys/jwt_private.pem" ] && [ ! -f "apps/api/keys/jwt_private.pem" ]; then
    echo -e "${YELLOW}Generating RS256 JWT keypair...${RESET}"
    (cd apps/api && uv run python -c "from app.core.security import generate_keys; generate_keys()")
fi

# Sync keys between root and apps/api/keys
if [ -f "apps/api/keys/jwt_private.pem" ] && [ ! -f "keys/jwt_private.pem" ]; then
    cp apps/api/keys/*.pem keys/ 2>/dev/null || true
elif [ -f "keys/jwt_private.pem" ] && [ ! -f "apps/api/keys/jwt_private.pem" ]; then
    cp keys/*.pem apps/api/keys/ 2>/dev/null || true
fi
echo -e "${GREEN}✓ Environment and JWT keys ready.${RESET}"

# ------------------------------------------------------------------------------
# 3. Start Infrastructure (PostgreSQL + pgvector, Redis, MinIO)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[3/5] Starting Docker infrastructure containers...${RESET}"
docker compose up -d

echo -e "${CYAN}Waiting for PostgreSQL to be ready...${RESET}"
MAX_RETRIES=30
RETRY_COUNT=0
until docker compose exec -T postgres pg_isready -U postgres -d ai_companion &> /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}Error: PostgreSQL did not become ready in time.${RESET}"
        docker compose logs postgres
        exit 1
    fi
    sleep 1
done
echo -e "${GREEN}✓ PostgreSQL is healthy and accepting connections.${RESET}"
echo -e "${GREEN}✓ Redis and MinIO are running.${RESET}"

# ------------------------------------------------------------------------------
# 4. Database Migrations
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[4/5] Running Alembic database migrations...${RESET}"
(cd apps/api && uv run alembic upgrade head)
echo -e "${GREEN}✓ Database schema is up to date.${RESET}"

if [[ "$MODE" == "infra_only" ]]; then
    echo -e "\n${GREEN}${BOLD}✓ Infrastructure is up and database is migrated!${RESET}"
    exit 0
fi

# ------------------------------------------------------------------------------
# 5. Start Application Services
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[5/5] Starting application servers...${RESET}"

echo -e "\n${CYAN}${BOLD}------------------------------------------------------------${RESET}"
echo -e "${BOLD}🚀 Active Services & Endpoints:${RESET}"
echo -e "   • ${BOLD}Web App:${RESET}       ${GREEN}http://localhost:3000${RESET}"
echo -e "   • ${BOLD}API Server:${RESET}    ${GREEN}http://localhost:8000${RESET}"
echo -e "   • ${BOLD}Swagger Docs:${RESET}  ${GREEN}http://localhost:8000/docs${RESET}"
echo -e "   • ${BOLD}MinIO Console:${RESET} ${GREEN}http://localhost:9001${RESET} (User: minioadmin / Pass: minioadmin)"
echo -e "   • ${BOLD}PostgreSQL:${RESET}    ${GREEN}localhost:5432${RESET} (DB: ai_companion)"
echo -e "   • ${BOLD}Redis:${RESET}         ${GREEN}localhost:6379${RESET}"
if [[ "$MODE" == "all" ]]; then
    echo -e "   • ${BOLD}Mobile (Expo):${RESET} ${GREEN}Metro Bundler Starting...${RESET}"
fi
echo -e "${CYAN}${BOLD}------------------------------------------------------------${RESET}"
echo -e "${YELLOW}Press Ctrl+C to stop all development servers.${RESET}\n"

# Run servers via Turbo
if [[ "$MODE" == "all" ]]; then
    exec pnpm turbo run dev
elif [[ "$MODE" == "api_only" ]]; then
    exec pnpm turbo run dev --filter=@ai-companion/api
elif [[ "$MODE" == "web_only" ]]; then
    exec pnpm turbo run dev --filter=@ai-companion/web
else
    exec pnpm turbo run dev --filter=@ai-companion/web --filter=@ai-companion/api
fi
