"""Embedding provider interface and implementations for local vector generation."""

from abc import ABC, abstractmethod
import hashlib
import math
import os
from typing import Optional, Sequence
import httpx

from app.core.config import settings as app_settings
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.providers.privacy import validate_provider_privacy


class BaseEmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @property
    @abstractmethod
    def provider_type(self) -> str:
        """Return provider type identifier."""

    @property
    @abstractmethod
    def model(self) -> str:
        """Return the embedding model name."""

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return the expected vector dimension."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for a single text input.

        Raises:
            ProviderConfigurationError: If provider, model, or vector dimensions are invalid.
            ValueError: If input text is invalid.
        """

    @abstractmethod
    async def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        """Generate embedding vectors for multiple text inputs.

        Raises:
            ProviderConfigurationError: If provider, model, or vector dimensions are invalid.
            ValueError: If input texts are invalid.
        """


class OllamaEmbeddingProvider(BaseEmbeddingProvider):
    """Local Ollama embedding provider using /api/embed or /api/embeddings."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        dimension: Optional[int] = None,
        timeout: float = 60.0,
    ):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self._model = model or getattr(app_settings, "EMBEDDING_MODEL", "nomic-embed-text")
        self._dimension = dimension or getattr(app_settings, "EMBEDDING_DIMENSION", 768)
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def provider_type(self) -> str:
        return "ollama"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return self._dimension

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _ensure_model(self) -> None:
        """Verify that the embedding model is installed in Ollama.

        Does NOT automatically pull missing models. Raises ProviderConfigurationError if missing.
        """
        client = await self._get_client()
        try:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError(f"Ollama server is unreachable at {self.base_url}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Failed to query Ollama models from {self.base_url}: {e}") from e

        installed_models = [m.get("name", "") for m in data.get("models", [])]
        candidates = {self._model}
        if ":" in self._model:
            base, tag = self._model.split(":", 1)
            if tag == "latest":
                candidates.add(base)
        else:
            candidates.add(f"{self._model}:latest")

        found = any(
            inst in candidates or inst.split(":")[0] in candidates
            for inst in installed_models
        )
        if not found:
            raise ProviderConfigurationError(
                f"Embedding model '{self._model}' is not installed in Ollama. "
                f"Please install it explicitly via 'ollama pull {self._model}'."
            )

    def _validate_vector(self, vector: list) -> list[float]:
        """Validate vector shape, dimension, and finite numeric values."""
        if not isinstance(vector, list) or len(vector) == 0:
            raise ProviderConfigurationError(
                f"Ollama returned invalid embedding payload for model '{self._model}'"
            )

        if len(vector) != self._dimension:
            raise ProviderConfigurationError(
                f"Embedding vector dimension mismatch: model '{self._model}' produced {len(vector)} dimensions, "
                f"but configuration specifies {self._dimension}."
            )

        clean_vector: list[float] = []
        for val in vector:
            if not isinstance(val, (int, float)) or not math.isfinite(val):
                raise ProviderConfigurationError(
                    f"Embedding vector from model '{self._model}' contains non-finite values (NaN or Inf)"
                )
            clean_vector.append(float(val))

        return clean_vector

    async def embed(self, text: str) -> list[float]:
        """Generate embedding vector for a single text."""
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Text content cannot be empty")

        await self._ensure_model()
        client = await self._get_client()

        # Try /api/embed first
        try:
            response = await client.post("/api/embed", json={"model": self._model, "input": text})
            if response.status_code == 404:
                # Fall back to legacy /api/embeddings
                response = await client.post("/api/embeddings", json={"model": self._model, "prompt": text})
            response.raise_for_status()
            data = response.json()
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError(f"Ollama server is unreachable at {self.base_url}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Ollama embedding request failed: {e}") from e

        # Extract vector from response
        if "embeddings" in data and isinstance(data["embeddings"], list) and len(data["embeddings"]) > 0:
            raw_vector = data["embeddings"][0]
        elif "embedding" in data:
            raw_vector = data["embedding"]
        else:
            raise ProviderConfigurationError(
                f"Ollama embedding response missing vector data: keys={list(data.keys())}"
            )

        return self._validate_vector(raw_vector)

    async def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        """Generate embedding vectors for multiple texts."""
        if not texts:
            return []

        for idx, t in enumerate(texts):
            if not isinstance(t, str) or not t.strip():
                raise ValueError(f"Text content at index {idx} cannot be empty")

        await self._ensure_model()
        client = await self._get_client()

        try:
            # Attempt batched /api/embed
            response = await client.post("/api/embed", json={"model": self._model, "input": list(texts)})
            if response.status_code == 200:
                data = response.json()
                raw_vectors = data.get("embeddings", [])
                if isinstance(raw_vectors, list) and len(raw_vectors) == len(texts):
                    return [self._validate_vector(v) for v in raw_vectors]
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError(f"Ollama server is unreachable at {self.base_url}") from e
        except httpx.HTTPError:
            pass

        # Fallback: sequential embedding
        results: list[list[float]] = []
        for t in texts:
            results.append(await self.embed(t))
        return results


class MockEmbeddingProvider(BaseEmbeddingProvider):
    """Deterministic mock embedding provider for isolated testing.

    Generates reproducible unit-normalized vectors derived from SHA-256 hash of input text.
    Disabled in production.
    """

    def __init__(
        self,
        dimension: int = 768,
        model: str = "mock-embed",
        environment: str = "test",
    ):
        if environment == "production":
            raise ProviderConfigurationError("Mock embedding provider is disabled in production.")
        self._dimension = dimension
        self._model = model
        self.environment = environment

    @property
    def provider_type(self) -> str:
        return "mock"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return self._dimension

    def _generate_vector(self, text: str) -> list[float]:
        """Generate a deterministic unit-length vector from text hash."""
        seed_bytes = hashlib.sha256(text.encode("utf-8")).digest()
        raw_vals: list[float] = []

        # Expand hash deterministically to desired dimension
        for i in range(self._dimension):
            h = hashlib.sha256(seed_bytes + i.to_bytes(4, "big")).digest()
            val = (int.from_bytes(h[:4], "big") / 0xFFFFFFFF) * 2.0 - 1.0
            raw_vals.append(val)

        norm = math.sqrt(sum(v * v for v in raw_vals)) or 1.0
        return [v / norm for v in raw_vals]

    async def embed(self, text: str) -> list[float]:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Text content cannot be empty")
        return self._generate_vector(text)

    async def embed_batch(self, texts: Sequence[str]) -> list[list[float]]:
        return [await self.embed(t) for t in texts]


def get_embedding_provider(
    provider_type: Optional[str] = None,
    settings: Optional[object] = None,
) -> BaseEmbeddingProvider:
    """Resolve and return an authorized embedding provider under the active privacy mode."""
    cfg = settings or app_settings

    target: str
    if provider_type and provider_type.strip():
        target = provider_type.lower().strip()
    elif getattr(cfg, "EMBEDDING_PROVIDER", None) and cfg.EMBEDDING_PROVIDER.strip():
        target = cfg.EMBEDDING_PROVIDER.lower().strip()
    else:
        # Default based on PRIVACY_MODE
        if cfg.PRIVACY_MODE in ("strict-local", "private-machine"):
            target = "ollama"
        elif cfg.PRIVACY_MODE == "cloud-allowed":
            raise ProviderConfigurationError(
                "In cloud-allowed mode, an explicit embedding provider must be specified via EMBEDDING_PROVIDER."
            )
        else:
            raise PrivacyViolationError(f"Unrecognized privacy mode: '{cfg.PRIVACY_MODE}'.")

    # Enforce privacy policy
    validate_provider_privacy(
        provider_type=target,
        privacy_mode=cfg.PRIVACY_MODE,
        base_url=getattr(cfg, "OLLAMA_BASE_URL", "http://localhost:11434"),
        environment=cfg.ENVIRONMENT,
    )

    if target == "mock":
        if cfg.ENVIRONMENT == "production":
            raise ProviderConfigurationError("Mock embedding provider is disabled in production.")
        return MockEmbeddingProvider(
            dimension=getattr(cfg, "EMBEDDING_DIMENSION", 768),
            environment=cfg.ENVIRONMENT,
        )

    if target == "ollama":
        if not getattr(cfg, "OLLAMA_BASE_URL", None):
            raise ProviderConfigurationError("Ollama base URL is not configured.")
        return OllamaEmbeddingProvider(
            base_url=cfg.OLLAMA_BASE_URL,
            model=getattr(cfg, "EMBEDDING_MODEL", "nomic-embed-text"),
            dimension=getattr(cfg, "EMBEDDING_DIMENSION", 768),
        )

    raise ProviderConfigurationError(
        f"Unknown or unsupported embedding provider '{target}'. Permitted providers are 'ollama' and 'mock'."
    )
