import os
from typing import AsyncIterator, Optional
import httpx

from app.core.exceptions import ProviderConfigurationError
from app.core.logging import get_logger
from app.providers import (
    BaseProvider,
    CompletionRequest,
    CompletionResponse,
    ProviderType,
    StreamingChunk,
)

logger = get_logger(__name__)


class OllamaProvider(BaseProvider):
    """Ollama local LLM provider."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.OLLAMA

    def get_available_models(self) -> list[str]:
        return [
            "llama3.1:8b",
            "llama3.1:70b",
            "llama3.2:3b",
            "llama3.2:1b",
            "mistral:7b",
            "codellama:7b",
            "phi3:mini",
        ]

    def get_default_model(self) -> str:
        from app.core.config import settings
        return getattr(settings, "OLLAMA_DEFAULT_MODEL", None) or os.getenv("OLLAMA_DEFAULT_MODEL", "llama3.1:8b")

    async def _get_client(self) -> "httpx.AsyncClient":
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=120.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _ensure_model(self, model: str) -> None:
        """Check if the requested model is installed in Ollama.

        Does NOT automatically pull missing models during inference/chat.
        Raises ProviderConfigurationError if model is not installed or Ollama is unreachable.
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
        candidates = {model}
        if ":" in model:
            base, tag = model.split(":", 1)
            if tag == "latest":
                candidates.add(base)
        else:
            candidates.add(f"{model}:latest")

        found = any(
            inst in candidates or inst.split(":")[0] in candidates
            for inst in installed_models
        )
        if not found:
            raise ProviderConfigurationError(
                f"Model '{model}' is not installed in Ollama. "
                f"Please install it explicitly via 'ollama pull {model}'."
            )

    async def pull_model(self, model: str) -> None:
        """Pull a model from the registry if missing."""
        client = await self._get_client()
        try:
            pull_response = await client.post("/api/pull", json={"name": model, "stream": False}, timeout=1800.0)
            pull_response.raise_for_status()
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError(f"Ollama server is unreachable at {self.base_url}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Failed to pull model '{model}': {e}") from e

    def _build_messages(self, request: CompletionRequest) -> list[dict]:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)
        return messages

    async def complete(self, request: CompletionRequest) -> "CompletionResponse":
        await self._ensure_model(request.model)
        client = await self._get_client()

        payload = {
            "model": request.model,
            "messages": self._build_messages(request),
            "options": {
                "temperature": request.temperature,
            },
            "stream": False,
        }
        if request.max_tokens:
            payload["options"]["num_predict"] = request.max_tokens

        try:
            response = await client.post("/api/chat", json=payload)
            response.raise_for_status()
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError(f"Ollama server is unreachable at {self.base_url}") from e
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout) as e:
            raise ProviderConfigurationError(f"Ollama request timed out: {e}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Ollama inference request failed: {e}") from e

        data = response.json()
        if "error" in data:
            raise ProviderConfigurationError(f"Ollama error: {data['error']}")

        return CompletionResponse(
            content=data["message"]["content"],
            model=data["model"],
            usage={
                "prompt_tokens": data.get("prompt_eval_count", 0),
                "completion_tokens": data.get("eval_count", 0),
                "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
            },
            finish_reason=data.get("done_reason"),
        )

    async def stream(self, request: CompletionRequest) -> AsyncIterator["StreamingChunk"]:
        await self._ensure_model(request.model)
        client = await self._get_client()

        payload = {
            "model": request.model,
            "messages": self._build_messages(request),
            "options": {
                "temperature": request.temperature,
            },
            "stream": True,
        }
        if request.max_tokens:
            payload["options"]["num_predict"] = request.max_tokens

        try:
            async with client.stream("POST", "/api/chat", json=payload) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise ProviderConfigurationError(
                        f"Ollama returned HTTP error {response.status_code}: {body.decode(errors='replace')}"
                    )
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        import json
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if "error" in data:
                        raise ProviderConfigurationError(f"Ollama streaming error: {data['error']}")

                    content = data.get("message", {}).get("content", "")
                    done = data.get("done", False)
                    finish_reason = data.get("done_reason") or ("stop" if done else None)

                    if content or done:
                        yield StreamingChunk(content=content, finish_reason=finish_reason)
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError(f"Ollama server is unreachable at {self.base_url}") from e
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout) as e:
            raise ProviderConfigurationError(f"Ollama streaming request timed out: {e}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Ollama streaming request failed: {e}") from e

    async def count_tokens(self, text: str, model: str) -> int:
        client = await self._get_client()
        try:
            response = await client.post("/api/embeddings", json={"model": model, "prompt": text})
            if response.status_code == 200:
                return len(text) // 4
        except Exception:
            pass
        return len(text.split())