class PrivacyViolationError(Exception):
    """Raised when an operation violates the active privacy mode policy."""


class ProviderConfigurationError(Exception):
    """Raised when an AI provider is misconfigured, unavailable, or missing."""
 