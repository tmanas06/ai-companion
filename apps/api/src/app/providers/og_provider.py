"""0G Router provider using its OpenAI-compatible API."""

import json
from typing import AsyncIterator, Optional

import httpx

from app.core.config import settings
from app.core.exceptions import ProviderConfigurationError
from app.providers import BaseProvider, CompletionRequest, CompletionResponse, ProviderType, StreamingChunk


class OGProvider(BaseProvider):
    """Hosted 0G inference provider for blockchain-aware requests."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or settings.OG_API_KEY
        self.base_url = (base_url or settings.OG_BASE_URL).rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.ZERO_G

    def get_available_models(self) -> list[str]:
        models = [settings.OG_DEFAULT_MODEL]
        if settings.OG_VOICE_MODEL and settings.OG_VOICE_MODEL not in models:
            models.append(settings.OG_VOICE_MODEL)
        return models

    def get_default_model(self) -> str:
        return settings.OG_DEFAULT_MODEL

    async def _get_client(self) -> httpx.AsyncClient:
        if not self.api_key:
            raise ProviderConfigurationError("0G provider is not configured: OG_API_KEY is missing")
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=120.0,
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _build_payload(self, request: CompletionRequest, stream: bool) -> dict:
        payload = {
            "model": request.model,
            "messages": self._build_messages(request),
            "temperature": request.temperature,
            "reasoning_effort": "low",
            "stream": stream,
        }
        if request.max_tokens:
            # The 0G in-house model may spend several hundred tokens on hidden
            # reasoning before emitting visible content, even for short replies.
            payload["max_tokens"] = max(request.max_tokens, 1024)
        return payload

    def _build_messages(self, request: CompletionRequest) -> list[dict]:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)
        return messages

    async def complete(self, request: CompletionRequest) -> CompletionResponse:
        client = await self._get_client()
        try:
            response = await client.post("/chat/completions", json=self._build_payload(request, False))
            response.raise_for_status()
            data = response.json()
            choice = data["choices"][0]
            content = choice["message"].get("content", "") or ""
            if not content.strip():
                raise ProviderConfigurationError(
                    "0G returned no visible answer before reaching its output limit"
                )
            return CompletionResponse(
                content=content,
                model=data.get("model", request.model),
                usage=data.get("usage"),
                finish_reason=choice.get("finish_reason"),
            )
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            raise ProviderConfigurationError("0G Router is unreachable") from exc
        except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError) as exc:
            raise ProviderConfigurationError(f"0G Router request failed: {exc}") from exc

    async def stream(self, request: CompletionRequest) -> AsyncIterator[StreamingChunk]:
        client = await self._get_client()
        try:
            async with client.stream("POST", "/chat/completions", json=self._build_payload(request, True)) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        data = json.loads(raw)
                        choice = data["choices"][0]
                        delta = choice.get("delta", {})
                        content = delta.get("content", "") or ""
                        if content:
                            yield StreamingChunk(content=content, finish_reason=choice.get("finish_reason"))
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.HTTPError) as exc:
            raise ProviderConfigurationError(f"0G Router streaming request failed: {exc}") from exc

    async def count_tokens(self, text: str, model: str) -> int:
        return len(text.split())
