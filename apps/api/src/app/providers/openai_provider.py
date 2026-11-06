import os
from typing import AsyncIterator, Optional
import httpx

from app.core.exceptions import ProviderConfigurationError
from app.providers import (
    BaseProvider,
    CompletionRequest,
    CompletionResponse,
    ProviderRegistry,
    ProviderType,
    StreamingChunk,
)


class OpenAIProvider(BaseProvider):
    """OpenAI API provider."""

    def __init__(self, api_key: Optional[str] = None, organization: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.organization = organization or os.getenv("OPENAI_ORG_ID")
        self.base_url = "https://api.openai.com/v1"
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.OPENAI

    def get_available_models(self) -> list[str]:
        return [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo",
        ]

    def get_default_model(self) -> str:
        return "gpt-4o-mini"

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            if self.organization:
                headers["OpenAI-Organization"] = self.organization
            self._client = httpx.AsyncClient(base_url=self.base_url, headers=headers, timeout=60.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _build_messages(self, request) -> list[dict]:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)
        return messages

    async def complete(self, request) -> "CompletionResponse":
        client = await self._get_client()

        payload = {
            "model": request.model,
            "messages": self._build_messages(request),
            "temperature": request.temperature,
            "stream": False,
        }
        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens

        try:
            response = await client.post("/chat/completions", json=payload)
            response.raise_for_status()
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError("OpenAI service is unreachable") from e
        except httpx.HTTPStatusError as e:
            raise ProviderConfigurationError(f"OpenAI API returned error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"OpenAI request failed: {e}") from e

        data = response.json()

        choice = data["choices"][0]
        return CompletionResponse(
            content=choice["message"]["content"],
            model=data["model"],
            usage=data.get("usage"),
            finish_reason=choice.get("finish_reason"),
        )

    async def stream(self, request) -> AsyncIterator["StreamingChunk"]:
        client = await self._get_client()

        payload = {
            "model": request.model,
            "messages": self._build_messages(request),
            "temperature": request.temperature,
            "stream": True,
        }
        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens

        try:
            async with client.stream("POST", "/chat/completions", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            import json
                            data = json.loads(data_str)
                            delta = data["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            finish_reason = data["choices"][0].get("finish_reason")
                            if content:
                                yield StreamingChunk(content=content, finish_reason=finish_reason)
                        except json.JSONDecodeError:
                            continue
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise ProviderConfigurationError("OpenAI service is unreachable") from e
        except httpx.HTTPStatusError as e:
            raise ProviderConfigurationError(f"OpenAI API returned error: {e.response.status_code}") from e
        except httpx.HTTPError as e:
            raise ProviderConfigurationError(f"OpenAI streaming request failed: {e}") from e

    async def count_tokens(self, text: str, model: str) -> int:
        try:
            import tiktoken
            encoding = tiktoken.encoding_for_model(model)
            return len(encoding.encode(text))
        except Exception:
            return len(text.split())

    def get_available_models(self) -> list[str]:
        return [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo",
        ]