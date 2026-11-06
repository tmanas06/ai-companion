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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS: list[str] = Field(default=["http://localhost:3000", "http://localhost:8081"])

    OPENAI_API_KEY: str | None = None
    OPENAI_ORG_ID: str | None = None
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"

    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-haiku-20240307"

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3.1:8b"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
