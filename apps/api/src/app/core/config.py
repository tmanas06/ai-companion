from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENVIRONMENT: str = Field(default="development", pattern="^(development|staging|production|test)$")
    LOG_LEVEL: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    PRIVACY_MODE: Literal["strict-local", "private-machine", "cloud-allowed"] = Field(
        default="private-machine",
        description="Privacy enforcement mode: strict-local, private-machine, or cloud-allowed",
    )
    DEFAULT_PROVIDER: str | None = Field(
        default=None,
        description="Explicit default provider override (e.g. 'ollama', 'mock', 'openai', 'anthropic')",
    )

    DATABASE_URL: PostgresDsn
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30

    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_POOL_SIZE: int = 10

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "RS256"
    JWT_PRIVATE_KEY_PATH: str = "./keys/jwt_private.pem"
    JWT_PUBLIC_KEY_PATH: str = "./keys/jwt_public.pem"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS: list[str] = Field(default=["http://localhost:3000", "http://localhost:3001", "http://localhost:8081"])

    OPENAI_API_KEY: str | None = None
    OPENAI_ORG_ID: str | None = None
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"

    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-haiku-20240307"

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "qwen2.5:3b"

    EMBEDDING_PROVIDER: str | None = Field(
        default=None,
        description="Explicit embedding provider override ('ollama', 'mock'). Defaults based on PRIVACY_MODE.",
    )
    EMBEDDING_MODEL: str = Field(
        default="nomic-embed-text",
        description="Embedding model name",
    )
    EMBEDDING_DIMENSION: int = Field(
        default=768,
        description="Expected embedding vector dimension",
        ge=1,
    )
    RAG_TOP_K: int = Field(
        default=5,
        description="Maximum number of relevant memories to retrieve for conversation context",
        ge=1,
        le=50,
    )
    RAG_SIMILARITY_THRESHOLD: float = Field(
        default=0.5,
        description="Maximum cosine distance threshold for memory retrieval (0.0 to 2.0)",
        ge=0.0,
        le=2.0,
    )

    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_BUCKET_NAME: str = "ai-companion-assets"
    S3_REGION: str = "us-east-1"
    S3_PUBLIC_BASE_URL: str | None = None

    SENDGRID_API_KEY: str | None = None
    EMAIL_FROM: str = "noreply@ai-companion.app"
    EMAIL_FROM_NAME: str = "AI Companion"

    SENTRY_DSN: str | None = None
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None
    OTEL_SERVICE_NAME: str = "ai-companion-api"
    FASTAPI_OTEL_AUTO_CONFIGURE: bool = True

    ENABLE_VOICE: bool = False
    ENABLE_MEMORY_EXTRACTION: bool = True
    ENABLE_AVATAR_CUSTOMIZATION: bool = True
    ENABLE_OAUTH_GOOGLE: bool = True
    ENABLE_OAUTH_APPLE: bool = False
    ENABLE_OAUTH_GITHUB: bool = True

    TTS_PROVIDER: str = "edge-tts"
    TTS_VOICE: str = "en-US-JennyNeural"

    STT_PROVIDER: str = "faster-whisper"
    STT_MODEL: str = "tiny.en"

    # SadTalker Realistic AI Lip-Sync Configuration (Experimental, disabled by default)
    SADTALKER_ENABLED: bool = Field(default=False, description="Enable local SadTalker talking-head video generation")
    SADTALKER_BASE_PATH: str = Field(default="tools/sadtalker", description="Relative or absolute path to SadTalker repository")
    SADTALKER_PYTHON_PATH: str = Field(default="tools/sadtalker/venv/bin/python", description="Path to isolated Python binary")
    SADTALKER_CHECKPOINTS_DIR: str = Field(default="tools/sadtalker/checkpoints", description="Path to model checkpoints directory")
    SADTALKER_DEVICE: str = Field(default="cpu", description="Inference device: 'cpu' or 'cuda'")
    SADTALKER_TIMEOUT_SECONDS: int = Field(default=1800, description="Maximum execution timeout in seconds for video generation")
    SADTALKER_MAX_AUDIO_SECONDS: float = Field(default=30.0, description="Maximum permitted audio length in seconds")
    SADTALKER_OUTPUT_DIR: str = Field(default="artifacts/sadtalker-generated", description="Directory for generated talking-head videos")
    SADTALKER_MAX_CONCURRENT_JOBS: int = Field(default=1, description="Concurrency limit for local inference jobs")
    SADTALKER_FILE_RETENTION_HOURS: int = Field(default=24, description="Retention duration for generated temporary videos")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
