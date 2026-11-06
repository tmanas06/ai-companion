import os
from typing import AsyncIterator, Optional
import httpx

from app.providers import (
    BaseProvider,
    CompletionRequest,
    CompletionResponse,
    ProviderType,
    StreamingChunk,
)


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
        return "llama3.1:8b"

    async def _get_client(self) -> "httpx.AsyncClient":
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=120.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _ensure_model(self, model: str) -> None:
        client = await self._get_client()
        try:
            response = await client.get(f"/api/tags")
            response.raise_for_status()
            data = response.json()
            models = [m["name"] for m in data.get("models", [])]
            if model not in models:
                # Try to pull the model
                pull_response = await client.post("/api/pull", json={"name": model})
                pull_response.raise_for_status()
        except httpx.HTTPError:
            pass  # Model might already exist or pull failed

    async def complete(self, request) -> "CompletionResponse":
        await self._ensure_model(request.model)
        client = await self._get_client()

        payload = {
            "model": request.model,
            "messages": request.messages,
            "options": {
                "temperature": request.temperature,
            },
            "stream": False,
        }
        if request.max_tokens:
            payload["options"]["num_predict"] = request.max_tokens

        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()

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

    async def stream(self, request) -> AsyncIterator["StreamingChunk"]:
        await self._ensure_model(request.model)
        client = await self._get_client()

        payload = {
            "model": request.model,
            "messages": request.messages,
            "options": {
                "temperature": request.temperature,
            },
            "stream": True,
        }
        if request.max_tokens:
            payload["options"]["num_predict"] = request.max_tokens

        async with client.stream("POST", "/api/chat", json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        import json
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            done = data.get("done", False)
                            finish_reason = "stop" if done else None
                            yield StreamingChunk(content=content, finish_reason=finish_reason)
                    except json.JSONDecodeError:
                        continue

    async def count_tokens(self, text: str, model: str) -> int:
        # Use Ollama's embed endpoint for token counting if available
        client = await self._get_client()
        try:
            response = await client.post("/api/embeddings", json={"model": model, "prompt": text})
            if response.status_code == 200:
                # Approximate token count from embedding dimension
                return len(text) // 4
        except Exception:
            pass
        return len(text.split())

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