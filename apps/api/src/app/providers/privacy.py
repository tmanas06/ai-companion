"""Privacy enforcement rules and locality verification for AI providers."""

import ipaddress
from urllib.parse import urlparse

from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError


def is_loopback_endpoint(url_or_host: str) -> bool:
    """Verify whether a URL or host string points strictly to a recognized local loopback endpoint.

    Strict-local guarantees require rejecting arbitrary DNS hostnames to eliminate DNS-rebinding
    and TOCTOU vulnerabilities. Only literal loopback IPs (127.0.0.0/8, ::1) and the explicit
    literal 'localhost' hostname are permitted.

    Rejects:
    - Arbitrary DNS hostnames (e.g. *.local, remote domains, dynamic DNS).
    - Public or private/LAN IP addresses (e.g. 192.168.x.x, 10.x.x.x, 172.16.x.x).
    - Non-HTTP/HTTPS schemes (e.g. ftp://, file://, ws://).
    - URLs containing embedded user/password credentials (e.g. http://user:pass@localhost).
    - Malformed URLs or invalid ports.

    Fails closed (returns False) on any parsing or validation failure.
    """
    if not url_or_host or not isinstance(url_or_host, str):
        return False

    try:
        raw = url_or_host.strip()
        if not raw:
            return False

        if "://" in raw:
            scheme_part = raw.split("://", 1)[0].lower()
            if scheme_part not in ("http", "https"):
                return False
            parsed = urlparse(raw)
        else:
            parsed = urlparse(f"http://{raw}")

        # Disallow embedded credentials
        if parsed.username or parsed.password:
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        hostname = hostname.lower().strip()

        # Validate port if present
        try:
            if parsed.port is not None and not (1 <= parsed.port <= 65535):
                return False
        except ValueError:
            return False

        # 1. Direct localhost check
        if hostname == "localhost":
            return True

        # 2. Strict literal IP check (no DNS resolution to avoid rebinding/TOCTOU)
        try:
            ip = ipaddress.ip_address(hostname)
            return ip.is_loopback
        except ValueError:
            # Arbitrary hostnames and malformed IPs are rejected in strict-local
            return False

    except Exception:
        return False


def validate_provider_privacy(
    provider_type: str,
    privacy_mode: str,
    base_url: str | None = None,
    environment: str = "development",
) -> None:
    """Enforce the global privacy policy before provider resolution or data transmission.

    Raises:
        PrivacyViolationError: If the requested provider or endpoint violates the active privacy mode.
        ProviderConfigurationError: If provider configuration (e.g. mock in production) is invalid.
    """
    normalized_type = provider_type.lower().strip()
    normalized_mode = privacy_mode.lower().strip()

    if normalized_mode == "strict-local":
        if normalized_type in ("openai", "anthropic", "0g", "zero-g", "og"):
            raise PrivacyViolationError(
                f"Hosted cloud provider '{normalized_type}' is prohibited under strict-local privacy mode."
            )

        if normalized_type == "ollama":
            if not base_url or not is_loopback_endpoint(base_url):
                raise PrivacyViolationError(
                    f"Remote Ollama endpoint '{base_url}' is prohibited under strict-local privacy mode. "
                    "Only on-device loopback endpoints (e.g. http://localhost:11434) are permitted."
                )

            # In production or staging deployments, a server process cannot guarantee that
            # loopback execution is on the user's client device.
            if environment in ("production", "staging"):
                raise PrivacyViolationError(
                    "strict-local inference cannot be established in a remote server deployment. "
                    "The backend cannot verify on-device execution relative to the user's client."
                )

        elif normalized_type == "mock":
            if environment == "production":
                raise ProviderConfigurationError("Mock provider is disabled in production.")

    elif normalized_mode == "private-machine":
        if normalized_type in ("openai", "anthropic", "0g", "zero-g", "og"):
            raise PrivacyViolationError(
                f"Hosted cloud provider '{normalized_type}' is prohibited under private-machine privacy mode."
            )

        if normalized_type == "mock":
            if environment == "production":
                raise ProviderConfigurationError("Mock provider is disabled in production.")

    elif normalized_mode == "cloud-allowed":
        if normalized_type == "mock" and environment == "production":
            raise ProviderConfigurationError("Mock provider is disabled in production.")

    else:
        raise PrivacyViolationError(f"Unrecognized privacy mode: '{privacy_mode}'.")
