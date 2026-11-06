import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from structlog import get_logger

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.providers.factory import initialize_default_providers

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "application_starting",
        environment=settings.ENVIRONMENT,
        privacy_mode=settings.PRIVACY_MODE,
    )
    initialize_default_providers()
    yield
    logger.info("application_shutting_down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Companion API",
        description="Backend API for AI Companion application",
        version="0.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(PrivacyViolationError)
    async def privacy_violation_handler(request: Request, exc: PrivacyViolationError):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "error_type": "privacy_violation"},
        )

    @app.exception_handler(ProviderConfigurationError)
    async def provider_configuration_handler(request: Request, exc: ProviderConfigurationError):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": str(exc), "error_type": "provider_configuration_error"},
        )

    app.include_router(api_router, prefix="/api/v1")

    # Serve 3D model assets directly from API to allow mobile access without Next.js running
    custom_models_dir = os.getenv("MODELS_STATIC_DIR")
    api_static_models = Path(__file__).resolve().parent.parent.parent / "static" / "models"
    web_public_models = Path(__file__).resolve().parent.parent.parent.parent / "web" / "public" / "models"

    resolved_models_dir = None
    if custom_models_dir and Path(custom_models_dir).is_dir():
        resolved_models_dir = Path(custom_models_dir)
    elif api_static_models.is_dir():
        resolved_models_dir = api_static_models
    elif web_public_models.is_dir():
        resolved_models_dir = web_public_models

    if resolved_models_dir:
        app.mount("/models", StaticFiles(directory=str(resolved_models_dir)), name="models")

    @app.get("/health", tags=["health"])
    async def health_check():
        return {"status": "ok", "service": "ai-companion-api"}

    return app


app = create_app()
