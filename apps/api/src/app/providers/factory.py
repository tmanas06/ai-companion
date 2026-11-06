from app.core.config import settings
from app.providers import (
    BaseProvider,
    MockProvider,
    ProviderRegistry,
    ProviderType,
    provider_registry,
)
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.ollama_provider import OllamaProvider


def initialize_providers() -> ProviderRegistry:
    """Initialize all configured providers."""
    registry = ProviderRegistry()

    # Always register mock provider for testing
    registry.register(MockProvider())

    # Register OpenAI if API key is configured
    if settings.OPENAI_API_KEY:
        registry.register(OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            organization=settings.OPENAI_ORG_ID,
        ))

    # Register Anthropic if API key is configured
    if settings.ANTHROPIC_API_KEY:
        registry.register(AnthropicProvider(api_key=settings.ANTHROPIC_API_KEY))

    # Register Ollama if base URL is configured
    if settings.OLLAMA_BASE_URL:
        registry.register(OllamaProvider(base_url=settings.OLLAMA_BASE_URL))

    return registry


def get_provider(provider_type: str | None = None) -> "BaseProvider":
    """Get a provider by type, or default."""
    if provider_type:
        try:
            return provider_registry.get(provider_type)
        except ValueError:
            pass
    return provider_registry.get_default()


def initialize_default_providers() -> None:
    """Initialize the global provider registry with configured providers."""
    global provider_registry
    provider_registry = initialize_providers()