from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
from dataclasses import dataclass
from enum import Enum


class ProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    ZERO_G = "0g"
    MOCK = "mock"


@dataclass
class CompletionRequest:
    messages: list[dict[str, str]]
    model: str
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    stream: bool = False
    system_prompt: Optional[str] = None
    tools: Optional[list[dict]] = None


@dataclass
class CompletionResponse:
    content: str
    model: str
    usage: Optional[dict] = None
    finish_reason: Optional[str] = None


@dataclass
class StreamingChunk:
    content: str
    finish_reason: Optional[str] = None


class BaseProvider(ABC):
    """Abstract base class for AI providers."""

    @property
    @abstractmethod
    def provider_type(self) -> ProviderType:
        """Return the provider type identifier."""

    @abstractmethod
    async def complete(self, request: CompletionRequest) -> CompletionResponse:
        """Generate a completion for the given request."""

    @abstractmethod
    async def stream(self, request: CompletionRequest) -> AsyncIterator[StreamingChunk]:
        """Stream a completion for the given request."""

    @abstractmethod
    async def count_tokens(self, text: str, model: str) -> int:
        """Count tokens in the given text."""

    @abstractmethod
    def get_available_models(self) -> list[str]:
        """Return list of available models for this provider."""

    def validate_model(self, model: str) -> bool:
        """Check if the model is available for this provider."""
        return model in self.get_available_models()

    def get_default_model(self) -> str:
        """Return the default model for this provider."""
        models = self.get_available_models()
        return models[0] if models else ""


class MockProvider(BaseProvider):
    """Mock provider for testing without external API calls."""

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.MOCK

    def get_available_models(self) -> list[str]:
        return ["mock-model-1", "mock-model-2"]

    async def complete(self, request: CompletionRequest) -> CompletionResponse:
        """Return a deterministic mock response based on the last user message."""
        last_user_msg = ""
        for msg in reversed(request.messages):
            if msg.get("role") == "user":
                last_user_msg = msg.get("content", "")
                break

        response_content = f"[Mock] I received: '{last_user_msg[:50]}...' (model: {request.model})"

        return CompletionResponse(
            content=response_content,
            model=request.model,
            usage={"prompt_tokens": len(last_user_msg) // 4, "completion_tokens": len(response_content) // 4, "total_tokens": (len(last_user_msg) + len(response_content)) // 4},
            finish_reason="stop",
        )

    async def stream(self, request: CompletionRequest):
        """Stream a mock response word by word."""
        last_user_msg = ""
        for msg in reversed(request.messages):
            if msg.get("role") == "user":
                last_user_msg = msg.get("content", "")
                break

        response_content = f"[Mock] I received: '{last_user_msg[:50]}...' (model: {request.model})"
        words = response_content.split()

        if not words:
            yield StreamingChunk(content="", finish_reason="stop")
            return

        for i, word in enumerate(words):
            chunk_content = word + (" " if i < len(words) - 1 else "")
            finish_reason = "stop" if i == len(words) - 1 else None
            yield StreamingChunk(content=chunk_content, finish_reason=finish_reason)

    async def count_tokens(self, text: str, model: str) -> int:
        """Simple word-based token estimation."""
        return len(text.split())


class ProviderRegistry:
    """Registry for managing AI providers."""

    def __init__(self):
        self._providers: dict[ProviderType, BaseProvider] = {}

    def register(self, provider: BaseProvider) -> None:
        """Register a provider."""
        self._providers[provider.provider_type] = provider

    def get(self, provider_type: ProviderType | str) -> BaseProvider:
        """Get a provider by type."""
        from app.core.exceptions import ProviderConfigurationError

        if isinstance(provider_type, str):
            try:
                pt = ProviderType(provider_type.lower())
            except ValueError:
                raise ProviderConfigurationError(f"Unknown provider type: '{provider_type}'")
        else:
            pt = provider_type

        if pt not in self._providers:
            raise ProviderConfigurationError(f"Provider '{pt.value}' is not configured or registered")
        return self._providers[pt]

    def get_default(self) -> BaseProvider:
        """Get the default provider without silent mock fallback."""
        from app.core.exceptions import ProviderConfigurationError

        if ProviderType.OLLAMA in self._providers:
            return self._providers[ProviderType.OLLAMA]
        non_mock = [p for pt, p in self._providers.items() if pt != ProviderType.MOCK]
        if non_mock:
            return non_mock[0]
        if ProviderType.MOCK in self._providers:
            return self._providers[ProviderType.MOCK]
        raise ProviderConfigurationError("No providers registered")

    def list_providers(self) -> list[ProviderType]:
        """List all registered provider types."""
        return list(self._providers.keys())


# Re-export canonical providers and privacy helpers
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.og_provider import OGProvider
from app.providers.privacy import is_loopback_endpoint, validate_provider_privacy
from app.providers.factory import (
    initialize_providers,
    get_provider,
    initialize_default_providers,
    provider_registry,
)
from app.providers.embedding import (
    BaseEmbeddingProvider,
    OllamaEmbeddingProvider,
    MockEmbeddingProvider,
    get_embedding_provider,
)

__all__ = [
    "ProviderType",
    "CompletionRequest",
    "CompletionResponse",
    "StreamingChunk",
    "BaseProvider",
    "MockProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "OllamaProvider",
    "OGProvider",
    "ProviderRegistry",
    "provider_registry",
    "initialize_providers",
    "get_provider",
    "initialize_default_providers",
    "BaseEmbeddingProvider",
    "OllamaEmbeddingProvider",
    "MockEmbeddingProvider",
    "get_embedding_provider",
    "PrivacyViolationError",
    "ProviderConfigurationError",
    "is_loopback_endpoint",
    "validate_provider_privacy",
]
