import os
from typing import AsyncIterator, Optional
import httpx

from app.core.exceptions import ProviderConfigurationError
from app.providers import (
    BaseProvider,
    CompletionRequest,
    CompletionResponse,
    ProviderType,
    StreamingChunk,
)


class AnthropicProvider(BaseProvider):
    """Anthropic API provider."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1"
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.ANTHROPIC

    def get_available_models(self) -> list[str]:
        return [
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
        ]

    def get_default_model(self) -> str:
        return "claude-3-5-haiku-20241022"

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            self._client = httpx.AsyncClient(base_url=self.base_url, headers=headers, timeout=60.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _build_messages(self, request) -> tuple[str, list[dict]]:
        system_prompt = request.system_prompt or ""
        messages = [msg for msg in request.messages if msg.get("role") != "system"]
        return system_prompt, messages

    async def complete(self, request) -> CompletionResponse:
        client = await self._get_client()

        system_prompt, messages = self._build_messages(request)

        payload = {
            "model": request.model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens or 4096,
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            response = await client.post("/messages", json=payload)
            response.raise_for_status()
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError("Anthropic service is unreachable") from e
        except httpx.HTTPStatusError as e:
            raise ProviderConfigurationError(f"Anthropic API returned error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Anthropic request failed: {e}") from e

        data = response.json()

        return CompletionResponse(
            content=data["content"][0]["text"],
            model=data["model"],
            usage={
                "prompt_tokens": data["usage"]["input_tokens"],
                "completion_tokens": data["usage"]["output_tokens"],
                "total_tokens": data["usage"]["input_tokens"] + data["usage"]["output_tokens"],
            },
            finish_reason=data.get("stop_reason"),
        )

    async def stream(self, request) -> AsyncIterator[StreamingChunk]:
        client = await self._get_client()

        system_prompt, messages = self._build_messages(request)

        payload = {
            "model": request.model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens or 4096,
            "stream": True,
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with client.stream("POST", "/messages", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            import json
                            data = json.loads(data_str)
                            if data.get("type") == "content_block_delta":
                                delta = data.get("delta", {})
                                content = delta.get("text", "")
                                if content:
                                    yield StreamingChunk(content=content)
                            elif data.get("type") == "message_stop":
                                yield StreamingChunk(content="", finish_reason="stop")
                        except json.JSONDecodeError:
                            continue
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError("Anthropic service is unreachable") from e
        except httpx.HTTPStatusError as e:
            raise ProviderConfigurationError(f"Anthropic API returned error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"Anthropic streaming request failed: {e}") from e

    async def count_tokens(self, text: str, model: str) -> int:
        # Anthropic doesn't provide a public tokenizer, use approximation
        return len(text) // 4

    def get_available_models(self) -> list[str]:
        return [
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
        ]