"""Provider factory with deterministic selection and fail-closed privacy enforcement."""

from typing import Optional, TYPE_CHECKING

from app.core.config import settings as app_settings
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.providers import (
    BaseProvider,
    MockProvider,
    ProviderRegistry,
    ProviderType,
)
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.og_provider import OGProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.privacy import validate_provider_privacy

if TYPE_CHECKING:
    from app.core.config import Settings


def initialize_providers(settings: Optional["Settings"] = None) -> ProviderRegistry:
    """Initialize providers based on application settings."""
    cfg = settings or app_settings
    registry = ProviderRegistry()

    # Register Ollama if base URL is configured
    if cfg.OLLAMA_BASE_URL:
        registry.register(OllamaProvider(base_url=cfg.OLLAMA_BASE_URL))

    if cfg.OG_API_KEY:
        registry.register(OGProvider(api_key=cfg.OG_API_KEY, base_url=cfg.OG_BASE_URL))

    # Register OpenAI if API key is configured
    if cfg.OPENAI_API_KEY:
        registry.register(
            OpenAIProvider(
                api_key=cfg.OPENAI_API_KEY,
                organization=cfg.OPENAI_ORG_ID,
            )
        )

    # Register Anthropic if API key is configured
    if cfg.ANTHROPIC_API_KEY:
        registry.register(AnthropicProvider(api_key=cfg.ANTHROPIC_API_KEY))

    # Register MockProvider only in non-production environments for explicit testing/dev
    if cfg.ENVIRONMENT != "production":
        registry.register(MockProvider())

    return registry


# Global provider registry initialized at application startup
provider_registry: ProviderRegistry = initialize_providers()


def initialize_default_providers(settings: Optional["Settings"] = None) -> ProviderRegistry:
    """Initialize/refresh the global provider registry with current configured providers."""
    global provider_registry
    provider_registry = initialize_providers(settings=settings)
    return provider_registry


def get_provider(
    provider_type: Optional[str] = None,
    registry: Optional[ProviderRegistry] = None,
    settings: Optional["Settings"] = None,
) -> BaseProvider:
    """Resolve and return an AI provider enforcing the configured privacy mode.

    Args:
        provider_type: Optional explicit provider identifier ('ollama', 'openai', 'anthropic', 'mock').
                       If None, resolves the default provider for the active PRIVACY_MODE.
        registry: Optional custom ProviderRegistry for testing / dependency injection.
                  Defaults to the global provider_registry.
        settings: Optional custom Settings instance. Defaults to global settings.

    Returns:
        BaseProvider: Permitted and configured provider instance.

    Raises:
        PrivacyViolationError: If the requested provider or resolved default violates PRIVACY_MODE.
        ProviderConfigurationError: If the provider is missing, misconfigured, or unavailable.
    """
    cfg = settings or app_settings
    active_registry = registry if registry is not None else provider_registry

    # 1. Determine target provider type
    target: str
    if provider_type and provider_type.strip():
        target = provider_type.lower().strip()
    elif cfg.DEFAULT_PROVIDER and cfg.DEFAULT_PROVIDER.strip():
        target = cfg.DEFAULT_PROVIDER.lower().strip()
    else:
        # Default resolution based on PRIVACY_MODE
        if cfg.PRIVACY_MODE in ("strict-local", "private-machine"):
            target = "ollama"
        elif cfg.PRIVACY_MODE == "cloud-allowed":
            raise ProviderConfigurationError(
                "In cloud-allowed mode, an explicit provider must be specified "
                "(via companion configuration or DEFAULT_PROVIDER). "
                "Cloud providers are not automatically selected."
            )
        else:
            raise PrivacyViolationError(f"Unrecognized privacy mode: '{cfg.PRIVACY_MODE}'.")

    # 2. Enforce global privacy policy before any provider or data access
    validate_provider_privacy(
        provider_type=target,
        privacy_mode=cfg.PRIVACY_MODE,
        base_url=cfg.OLLAMA_BASE_URL,
        environment=cfg.ENVIRONMENT,
    )

    # 3. Retrieve or lazily register the validated provider
    if target == "mock":
        if cfg.ENVIRONMENT == "production":
            raise ProviderConfigurationError("Mock provider is disabled in production.")
        try:
            return active_registry.get(ProviderType.MOCK)
        except ProviderConfigurationError:
            mock = MockProvider()
            active_registry.register(mock)
            return mock

    elif target == "ollama":
        if not cfg.OLLAMA_BASE_URL:
            raise ProviderConfigurationError(
                "Ollama is not configured (OLLAMA_BASE_URL is not set). "
                f"In {cfg.PRIVACY_MODE} mode, a local/private provider is required."
            )
        try:
            return active_registry.get(ProviderType.OLLAMA)
        except ProviderConfigurationError:
            # Lazily register if base_url is present
            provider = OllamaProvider(base_url=cfg.OLLAMA_BASE_URL)
            active_registry.register(provider)
            return provider

    elif target == "openai":
        if not cfg.OPENAI_API_KEY:
            raise ProviderConfigurationError(
                "OpenAI provider requested, but OPENAI_API_KEY is not configured."
            )
        try:
            return active_registry.get(ProviderType.OPENAI)
        except ProviderConfigurationError:
            provider = OpenAIProvider(
                api_key=cfg.OPENAI_API_KEY,
                organization=cfg.OPENAI_ORG_ID,
            )
            active_registry.register(provider)
            return provider

    elif target == "anthropic":
        if not cfg.ANTHROPIC_API_KEY:
            raise ProviderConfigurationError(
                "Anthropic provider requested, but ANTHROPIC_API_KEY is not configured."
            )
        try:
            return active_registry.get(ProviderType.ANTHROPIC)
        except ProviderConfigurationError:
            provider = AnthropicProvider(api_key=cfg.ANTHROPIC_API_KEY)
            active_registry.register(provider)
            return provider

    elif target in ("0g", "zero-g", "og"):
        if not cfg.OG_API_KEY:
            raise ProviderConfigurationError("0G provider requested, but OG_API_KEY is not configured.")
        try:
            return active_registry.get(ProviderType.ZERO_G)
        except ProviderConfigurationError:
            provider = OGProvider(api_key=cfg.OG_API_KEY, base_url=cfg.OG_BASE_URL)
            active_registry.register(provider)
            return provider

    else:
        raise ProviderConfigurationError(
            f"Unknown provider '{target}'. Permitted providers are: 'ollama', '0g', 'openai', 'anthropic', 'mock'."
        )
