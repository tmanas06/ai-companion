from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
from dataclasses import dataclass
from enum import Enum


class ProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
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

    def get(self, provider_type: ProviderType) -> BaseProvider:
        """Get a provider by type."""
        if provider_type not in self._providers:
            raise ValueError(f"Provider {provider_type} not registered")
        return self._providers[provider_type]

    def get_default(self) -> BaseProvider:
        """Get the default provider (mock if available, otherwise first registered)."""
        if ProviderType.MOCK in self._providers:
            return self._providers[ProviderType.MOCK]
        if self._providers:
            return next(iter(self._providers.values()))
        raise ValueError("No providers registered")

    def list_providers(self) -> list[ProviderType]:
        """List all registered provider types."""
        return list(self._providers.keys())


# Global provider registry
provider_registry = ProviderRegistry()

# Register mock provider by default
provider_registry.register(MockProvider())

# Re-export from submodules
from app.providers.openai_provider import OpenAIProvider, AnthropicProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.factory import initialize_providers, get_provider, initialize_default_providers

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
    "ProviderRegistry",
    "provider_registry",
    "initialize_providers",
    "get_provider",
    "initialize_default_providers",
]