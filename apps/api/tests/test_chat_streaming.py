"""Comprehensive tests for Milestone 3.1: Reliable, Incremental Chat Streaming.

Covers:
1. Incremental Ollama stream parsing (chunks, done flag, empty lines, malformed JSON, error payloads).
2. Provider resilience (timeouts, connection failures, no-hosted-fallback, no /api/pull on missing model).
3. ConversationService streaming lifecycle (start, chunk, completion, error events).
4. Safe persistence (upfront user message persistence, partial assistant not committed on failure/cancel).
5. Chain-of-thought / reasoning tag stripping (<think>...</think>).
6. Security & isolation (authentication, conversation/companion ownership, inactive companion rejection).
7. Privacy mode enforcement (cloud providers blocked in strict-local and private-machine).
8. Memory isolation in RAG (approved memories included as untrusted, pending/sensitive excluded).
9. Concurrency protection (per-conversation locks prevent interleaved corruption).
10. HTTP SSE endpoint wire format and client disconnection handling.
"""

import asyncio
from datetime import UTC, datetime
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import httpx
from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models import Companion, Conversation, Memory, Message, User
from app.models.user import ConsentStatus, MemorySource, MemoryType
from app.providers import (
    CompletionRequest,
    MockProvider,
    OllamaProvider,
    StreamingChunk,
)
from app.schemas.conversation import ChatRequest
from app.services.conversation import ConversationService, strip_internal_reasoning


# ==============================================================================
# 1. Incremental Ollama Stream Parsing & Provider Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_ollama_stream_incremental_parsing():
    """Verify OllamaProvider.stream yields incremental chunks and completes with finish_reason."""
    provider = OllamaProvider(base_url="http://localhost:11434")

    # Simulate newline-delimited JSON stream from Ollama /api/chat
    stream_lines = [
        b'{"message": {"role": "assistant", "content": "Hello "}, "done": false}\n',
        b'{"message": {"role": "assistant", "content": "there, "}, "done": false}\n',
        b'{"message": {"role": "assistant", "content": "friend!"}, "done": false}\n',
        b'{"done": true, "done_reason": "stop"}\n',
    ]

    async def mock_aiter_lines():
        for line in stream_lines:
            yield line.decode("utf-8")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.aiter_lines = mock_aiter_lines
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    # Tags check succeeds
    mock_client.get = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "llama3.1:8b"}]},
            raise_for_status=lambda: None,
        )
    )

    class MockStreamContext:
        async def __aenter__(self):
            return mock_response

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_client.stream = MagicMock(return_value=MockStreamContext())

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = CompletionRequest(
            messages=[{"role": "user", "content": "Hi"}],
            model="llama3.1:8b",
        )

        chunks = []
        async for chunk in provider.stream(req):
            chunks.append(chunk)

        assert len(chunks) == 4
        assert chunks[0].content == "Hello "
        assert chunks[0].finish_reason is None
        assert chunks[1].content == "there, "
        assert chunks[2].content == "friend!"
        assert chunks[3].finish_reason == "stop"
        assert "".join(c.content for c in chunks) == "Hello there, friend!"


@pytest.mark.asyncio
async def test_ollama_stream_handles_empty_lines_and_malformed_chunks():
    """Verify malformed JSON or empty lines are skipped without crashing the stream."""
    provider = OllamaProvider(base_url="http://localhost:11434")

    stream_lines = [
        "",  # Empty line
        "   \n",  # Whitespace line
        '{"message": {"role": "assistant", "content": "Valid "}, "done": false}\n',
        "INVALID NOT JSON {{{",  # Malformed JSON
        '{"message": {"role": "assistant", "content": "chunk"}, "done": false}\n',
        '{"done": true, "done_reason": "stop"}\n',
    ]

    async def mock_aiter_lines():
        for line in stream_lines:
            yield line

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.aiter_lines = mock_aiter_lines
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.get = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "llama3.1:8b"}]},
            raise_for_status=lambda: None,
        )
    )

    class MockStreamContext:
        async def __aenter__(self):
            return mock_response

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_client.stream = MagicMock(return_value=MockStreamContext())

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = CompletionRequest(messages=[{"role": "user", "content": "Hi"}], model="llama3.1:8b")

        chunks = []
        async for chunk in provider.stream(req):
            chunks.append(chunk)

        # The two valid chunks and final done chunk
        assert len(chunks) == 3
        assert "".join(c.content for c in chunks) == "Valid chunk"
        assert chunks[-1].finish_reason == "stop"


@pytest.mark.asyncio
async def test_ollama_stream_error_payload_raises():
    """Verify Ollama error response during streaming raises ProviderConfigurationError."""
    provider = OllamaProvider(base_url="http://localhost:11434")

    stream_lines = ['{"error": "model requires more VRAM than available"}\n']

    async def mock_aiter_lines():
        for line in stream_lines:
            yield line

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.aiter_lines = mock_aiter_lines
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.get = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "llama3.1:8b"}]},
            raise_for_status=lambda: None,
        )
    )

    class MockStreamContext:
        async def __aenter__(self):
            return mock_response

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_client.stream = MagicMock(return_value=MockStreamContext())

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = CompletionRequest(messages=[{"role": "user", "content": "Hi"}], model="llama3.1:8b")
        with pytest.raises(ProviderConfigurationError) as exc_info:
            async for _ in provider.stream(req):
                pass
        assert "Ollama streaming error" in str(exc_info.value)


@pytest.mark.asyncio
async def test_ollama_stream_timeout_handling():
    """Verify httpx.ReadTimeout during streaming raises ProviderConfigurationError."""
    provider = OllamaProvider(base_url="http://localhost:11434")

    mock_client = MagicMock()
    mock_client.get = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "llama3.1:8b"}]},
            raise_for_status=lambda: None,
        )
    )

    class MockTimeoutStream:
        async def __aenter__(self):
            raise httpx.ReadTimeout("Read timed out")

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_client.stream = MagicMock(return_value=MockTimeoutStream())

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = CompletionRequest(messages=[{"role": "user", "content": "Hi"}], model="llama3.1:8b")
        with pytest.raises(ProviderConfigurationError) as exc_info:
            async for _ in provider.stream(req):
                pass
        assert "timed out" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_ollama_stream_missing_model_never_pulls():
    """Verify missing Ollama model raises ProviderConfigurationError without calling /api/pull."""
    provider = OllamaProvider(base_url="http://localhost:11434")

    mock_client = MagicMock()
    mock_client.get = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "llama3.1:8b"}]},
            raise_for_status=lambda: None,
        )
    )
    mock_client.post = AsyncMock()

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = CompletionRequest(messages=[{"role": "user", "content": "Hi"}], model="deepseek-r1:8b")
        with pytest.raises(ProviderConfigurationError) as exc_info:
            async for _ in provider.stream(req):
                pass
        assert "not installed in Ollama" in str(exc_info.value)
        # Verify /api/pull was never invoked
        pull_calls = [c for c in mock_client.post.call_args_list if "/api/pull" in str(c)]
        assert len(pull_calls) == 0


# ==============================================================================
# 2. Reasoning Tag Stripping Tests
# ==============================================================================


def test_strip_internal_reasoning():
    """Verify <think> blocks are stripped from model outputs."""
    raw = "<think>The user wants a summary of quantum physics.</think>Quantum physics is fascinating."
    assert strip_internal_reasoning(raw) == "Quantum physics is fascinating."

    # Multi-line reasoning
    raw_multiline = "<think>\nStep 1: Check facts.\nStep 2: Format output.\n</think>\nHere is the answer."
    assert strip_internal_reasoning(raw_multiline) == "Here is the answer."

    # Multiple reasoning blocks
    raw_multiple = "<think>part 1</think>Hello <think>part 2</think>world!"
    assert strip_internal_reasoning(raw_multiple) == "Hello world!"

    # Unclosed think tag (e.g. cut off)
    raw_unclosed = "<think>still thinking... I should explain"
    assert strip_internal_reasoning(raw_unclosed) == ""

    # Normal text without think tag
    assert strip_internal_reasoning("Just a normal response.") == "Just a normal response."


# ==============================================================================
# 3. ConversationService Chat Streaming Lifecycle & Persistence Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_stream_lifecycle_success(monkeypatch):
    """Verify clean chat_stream emits start, chunk, completion events and persists messages."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "ENABLE_MEMORY_EXTRACTION", False)

    async with async_session_maker() as session:
        user = User(
            email=f"stream_lifecycle_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Stream Lifecycle User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Stream Companion",
            system_prompt="You are an AI friend.",
            llm_config={"provider": "ollama", "model": "llama3.1:8b"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)

        # Mock provider stream yielding 3 chunks
        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def mock_stream_gen(req):
            yield StreamingChunk(content="Hello ", finish_reason=None)
            yield StreamingChunk(content="from ", finish_reason=None)
            yield StreamingChunk(content="stream!", finish_reason="stop")

        mock_provider.stream = mock_stream_gen

        with patch("app.services.conversation.get_provider", return_value=mock_provider):
            req = ChatRequest(companion_id=companion.id, message="Hello streaming AI")
            events = []
            async for ev in service.chat_stream(user.id, req):
                events.append(ev)

            # Check event types: start, chunk, chunk, chunk, completion
            assert len(events) == 5
            assert events[0]["event"] == "start"
            assert "conversation_id" in events[0]["data"]
            assert events[0]["data"]["model"] == "llama3.1:8b"

            assert events[1]["event"] == "chunk"
            assert events[1]["data"]["content"] == "Hello "

            assert events[2]["event"] == "chunk"
            assert events[2]["data"]["content"] == "from "

            assert events[3]["event"] == "chunk"
            assert events[3]["data"]["content"] == "stream!"

            assert events[4]["event"] == "completion"
            assert events[4]["data"]["content"] == "Hello from stream!"
            assert events[4]["data"]["finish_reason"] == "stop"

            # Verify database persistence: both user message and assistant message persisted
            conv_id = events[0]["data"]["conversation_id"]
            msgs = (
                (
                    await session.execute(
                        select(Message)
                        .where(Message.conversation_id == conv_id)
                        .order_by(Message.created_at.asc())
                    )
                )
                .scalars()
                .all()
            )

            assert len(msgs) == 2
            assert msgs[0].role == "user"
            assert msgs[0].content == "Hello streaming AI"
            assert msgs[1].role == "assistant"
            assert msgs[1].content == "Hello from stream!"

            # Verify conversation message_count incremented to 2
            conv = await session.get(Conversation, conv_id)
            assert conv.message_count == 2


@pytest.mark.asyncio
async def test_chat_stream_preserves_user_message_on_inference_failure(monkeypatch):
    """Priority Requirement: User message is committed upfront; inference failure does NOT drop user message and does NOT commit partial assistant."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(
            email=f"fail_preserve_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Preserve User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Fail Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama", "model": "llama3.1:8b"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)

        # Mock provider that fails mid-stream after emitting one chunk
        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def failing_stream(req):
            yield StreamingChunk(content="Partial words...", finish_reason=None)
            raise ProviderConfigurationError("Ollama disconnected unexpectedly")

        mock_provider.stream = failing_stream

        with patch("app.services.conversation.get_provider", return_value=mock_provider):
            req = ChatRequest(companion_id=companion.id, message="My important query that must not be lost")
            events = []
            async for ev in service.chat_stream(user.id, req):
                events.append(ev)

            # Verify events: start, chunk, error
            event_types = [e["event"] for e in events]
            assert event_types == ["start", "chunk", "error"]
            assert events[-1]["data"]["error_type"] in ("provider_error", "provider_configuration_error")

            conv_id = events[0]["data"]["conversation_id"]

            # CRITICAL ASSERTIONS:
            # 1. User message MUST be persisted
            user_msg = (
                await session.execute(
                    select(Message).where(
                        Message.conversation_id == conv_id,
                        Message.role == "user",
                    )
                )
            ).scalar_one_or_none()
            assert user_msg is not None
            assert user_msg.content == "My important query that must not be lost"

            # 2. Partial assistant message MUST NOT be persisted
            assistant_msg = (
                await session.execute(
                    select(Message).where(
                        Message.conversation_id == conv_id,
                        Message.role == "assistant",
                    )
                )
            ).scalar_one_or_none()
            assert assistant_msg is None

            # 3. message_count must be 1 (user message only)
            conv = await session.get(Conversation, conv_id)
            assert conv.message_count == 1


@pytest.mark.asyncio
async def test_chat_stream_client_cancellation_preserves_user_message_only(monkeypatch):
    """Verify client disconnection / cancellation preserves user message but discards partial assistant."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(
            email=f"cancel_stream_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Cancel User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Cancel Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)

        # Mock provider that sleeps forever between chunks
        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def slow_stream(req):
            yield StreamingChunk(content="First chunk...", finish_reason=None)
            # Simulate long wait before next chunk
            await asyncio.sleep(10)
            yield StreamingChunk(content="Second chunk", finish_reason="stop")

        mock_provider.stream = slow_stream

        with patch("app.services.conversation.get_provider", return_value=mock_provider):
            req = ChatRequest(companion_id=companion.id, message="User cancelled this")
            stream_gen = service.chat_stream(user.id, req)

            # Consume start and first chunk
            ev1 = await stream_gen.__anext__()
            assert ev1["event"] == "start"
            conv_id = ev1["data"]["conversation_id"]

            ev2 = await stream_gen.__anext__()
            assert ev2["event"] == "chunk"

            # Now close the generator simulating client abort/disconnect
            await stream_gen.aclose()

            # Verify DB state:
            user_msgs = (
                (
                    await session.execute(
                        select(Message).where(
                            Message.conversation_id == conv_id,
                            Message.role == "user",
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(user_msgs) == 1
            assert user_msgs[0].content == "User cancelled this"

            asst_msgs = (
                (
                    await session.execute(
                        select(Message).where(
                            Message.conversation_id == conv_id,
                            Message.role == "assistant",
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert len(asst_msgs) == 0


@pytest.mark.asyncio
async def test_chat_stream_strips_internal_reasoning_before_persistence(monkeypatch):
    """Verify <think> blocks are stripped from assistant messages in streaming mode."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(
            email=f"think_stream_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Think User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Think Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)

        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def reasoning_stream(req):
            yield StreamingChunk(content="<think>Evaluating user intent.</think>Here is your answer.", finish_reason="stop")

        mock_provider.stream = reasoning_stream

        with patch("app.services.conversation.get_provider", return_value=mock_provider):
            req = ChatRequest(companion_id=companion.id, message="Think test")
            events = []
            async for ev in service.chat_stream(user.id, req):
                events.append(ev)

            completion_ev = [e for e in events if e["event"] == "completion"][0]
            assert "<think>" not in completion_ev["data"]["content"]
            assert completion_ev["data"]["content"] == "Here is your answer."

            conv_id = events[0]["data"]["conversation_id"]
            db_asst = (
                await session.execute(
                    select(Message).where(
                        Message.conversation_id == conv_id,
                        Message.role == "assistant",
                    )
                )
            ).scalar_one()

            assert "<think>" not in db_asst.content
            assert db_asst.content == "Here is your answer."


# ==============================================================================
# 4. Security, Isolation, and Ownership Enforcement Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_stream_rejects_unowned_companion():
    """Verify a user cannot stream chat with another user's companion."""
    async with async_session_maker() as session:
        user_a = User(email=f"user_a_{uuid4()}@example.com", password_hash="hash", full_name="User A")
        user_b = User(email=f"user_b_{uuid4()}@example.com", password_hash="hash", full_name="User B")
        session.add_all([user_a, user_b])
        await session.flush()

        comp_b = Companion(user_id=user_b.id, name="User B Companion", system_prompt="B")
        session.add(comp_b)
        await session.commit()

        service = ConversationService(session)
        req = ChatRequest(companion_id=comp_b.id, message="Attempting to chat with B's companion")

        with pytest.raises(ValueError):
            async for _ in service.chat_stream(user_a.id, req):
                pass


@pytest.mark.asyncio
async def test_chat_stream_rejects_unowned_conversation():
    """Verify a user cannot stream into another user's conversation."""
    async with async_session_maker() as session:
        user_a = User(email=f"user_a_conv_{uuid4()}@example.com", password_hash="hash", full_name="User A")
        user_b = User(email=f"user_b_conv_{uuid4()}@example.com", password_hash="hash", full_name="User B")
        session.add_all([user_a, user_b])
        await session.flush()

        comp_a = Companion(user_id=user_a.id, name="Comp A", system_prompt="A")
        comp_b = Companion(user_id=user_b.id, name="Comp B", system_prompt="B")
        session.add_all([comp_a, comp_b])
        await session.flush()

        conv_b = Conversation(user_id=user_b.id, companion_id=comp_b.id, title="Conv B")
        session.add(conv_b)
        await session.commit()

        service = ConversationService(session)
        req = ChatRequest(
            conversation_id=conv_b.id,
            companion_id=comp_a.id,
            message="Hijack attempt",
        )

        with pytest.raises(ValueError):
            async for _ in service.chat_stream(user_a.id, req):
                pass


@pytest.mark.asyncio
async def test_chat_stream_rejects_inactive_companion():
    """Verify inactive companion cannot be chatted with in stream mode."""
    async with async_session_maker() as session:
        user = User(email=f"inactive_comp_{uuid4()}@example.com", password_hash="hash", full_name="User")
        session.add(user)
        await session.flush()

        comp = Companion(user_id=user.id, name="Inactive Comp", system_prompt="Sys", is_active=False)
        session.add(comp)
        await session.commit()

        service = ConversationService(session)
        req = ChatRequest(companion_id=comp.id, message="Hello inactive")

        with pytest.raises(ValueError) as exc_info:
            async for _ in service.chat_stream(user.id, req):
                pass
        assert "inactive" in str(exc_info.value).lower()


# ==============================================================================
# 5. Privacy Mode & Provider Fallback Enforcement Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_stream_strict_local_blocks_cloud_providers(monkeypatch):
    """Verify strict-local prohibits cloud providers in streaming mode."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "strict-local")

    async with async_session_maker() as session:
        user = User(email=f"strict_local_{uuid4()}@example.com", password_hash="hash", full_name="Strict")
        session.add(user)
        await session.flush()

        comp = Companion(
            user_id=user.id,
            name="Cloud Comp",
            system_prompt="Sys",
            llm_config={"provider": "openai"},
        )
        session.add(comp)
        await session.commit()

        service = ConversationService(session)
        req = ChatRequest(companion_id=comp.id, message="Try cloud in strict-local")

        with pytest.raises(PrivacyViolationError):
            async for _ in service.chat_stream(user.id, req):
                pass

        # Verify no messages or conversations were created
        msgs = (await session.execute(select(Message).where(Message.content == "Try cloud in strict-local"))).scalars().all()
        assert len(msgs) == 0


@pytest.mark.asyncio
async def test_chat_stream_no_hosted_fallback_when_ollama_fails(monkeypatch):
    """Verify when Ollama fails, system never falls back to cloud provider."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-secret-test-key")

    async with async_session_maker() as session:
        user = User(email=f"no_fallback_{uuid4()}@example.com", password_hash="hash", full_name="No Fallback")
        session.add(user)
        await session.flush()

        comp = Companion(
            user_id=user.id,
            name="Ollama Comp",
            system_prompt="Sys",
            llm_config={"provider": "ollama", "model": "llama3.1:8b"},
        )
        session.add(comp)
        await session.commit()

        service = ConversationService(session)

        # Provider stream fails with connection error
        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def failing_stream(req):
            if False:
                yield StreamingChunk(content="")
            raise ProviderConfigurationError("Ollama unreachable on localhost:11434")

        mock_provider.stream = failing_stream

        with patch("app.services.conversation.get_provider") as mock_get_prov:
            mock_get_prov.return_value = mock_provider

            req = ChatRequest(companion_id=comp.id, message="Should fail cleanly without cloud fallback")
            events = []
            async for ev in service.chat_stream(user.id, req):
                events.append(ev)

            # Error event emitted
            assert events[-1]["event"] == "error"
            assert "Ollama unreachable" in events[-1]["data"]["detail"]

            # CRITICAL: Verify get_provider was only asked for ollama, NEVER openai
            for call in mock_get_prov.call_args_list:
                prov_arg = call.kwargs.get("provider_type") or (call.args[0] if call.args else None)
                assert prov_arg == "ollama"


# ==============================================================================
# 6. Memory RAG Context Delimitation & Sensitive Memory Exclusion Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_stream_approved_memories_delimited_and_pending_excluded(monkeypatch):
    """Verify chat_stream includes approved/auto_approved memories in untrusted context, and excludes pending/denied."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    dummy_vec = [0.1] * 768

    async with async_session_maker() as session:
        user = User(email=f"mem_stream_{uuid4()}@example.com", password_hash="hash", full_name="Mem Stream")
        session.add(user)
        await session.flush()

        comp = Companion(user_id=user.id, name="Mem Companion", system_prompt="You are helpful.", llm_config={"provider": "ollama"})
        session.add(comp)
        await session.commit()

        # 1. Approved memory (should be included)
        mem_approved = Memory(
            user_id=user.id,
            companion_id=comp.id,
            content="User loves black coffee with oat milk.",
            memory_type="preference",
            source="user_explicit",
            consent_status="approved",
            is_sensitive=False,
            embedding=dummy_vec,
        )
        # 2. Pending sensitive memory (MUST be excluded)
        mem_pending = Memory(
            user_id=user.id,
            companion_id=comp.id,
            content="User has a secret password123.",
            memory_type="fact",
            source="model_inference",
            consent_status="pending",
            is_sensitive=True,
            embedding=dummy_vec,
        )
        # 3. Denied memory (MUST be excluded)
        mem_denied = Memory(
            user_id=user.id,
            companion_id=comp.id,
            content="User hates dogs.",
            memory_type="preference",
            source="model_inference",
            consent_status="denied",
            is_sensitive=False,
            embedding=dummy_vec,
        )
        session.add_all([mem_approved, mem_pending, mem_denied])
        await session.commit()

        # Mock embedding provider so vector search returns candidates
        mock_embedder = MagicMock()
        mock_embedder.dimension = 768
        mock_embedder.embed = AsyncMock(return_value=dummy_vec)

        # Mock LLM provider to capture the prompt passed to stream()
        captured_requests = []
        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def capturing_stream(req):
            captured_requests.append(req)
            yield StreamingChunk(content="Coffee noted!", finish_reason="stop")

        mock_provider.stream = capturing_stream

        with patch("app.providers.embedding.get_embedding_provider", return_value=mock_embedder):
            with patch("app.services.conversation.get_provider", return_value=mock_provider):
                service = ConversationService(session)
                req = ChatRequest(companion_id=comp.id, message="What do I like to drink in the morning?")

                events = []
                async for ev in service.chat_stream(user.id, req):
                    events.append(ev)

                assert len(captured_requests) == 1
                prompt_messages = captured_requests[0].messages

                # Extract context from messages
                system_prompt = captured_requests[0].system_prompt or prompt_messages[0]["content"]

                # Assert approved memory IS present inside untrusted context
                assert "black coffee with oat milk" in system_prompt
                assert "<context>" in system_prompt
                assert "untrusted user data" in system_prompt.lower()

                # Assert pending and denied memories are NEVER present
                assert "secret password123" not in system_prompt
                assert "hates dogs" not in system_prompt


# ==============================================================================
# 7. Concurrency Protection Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_stream_concurrent_turns_serialized(monkeypatch):
    """Verify concurrent streaming calls on the same conversation are serialized by the per-conversation lock."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session1:
        async with async_session_maker() as session2:
            user = User(email=f"concur_stream_{uuid4()}@example.com", password_hash="hash", full_name="Concur User")
            session1.add(user)
            await session1.flush()

            comp = Companion(user_id=user.id, name="Concur Comp", system_prompt="Test", llm_config={"provider": "ollama"})
            session1.add(comp)
            await session1.flush()

            conv = Conversation(user_id=user.id, companion_id=comp.id, title="Concur Conv")
            session1.add(conv)
            await session1.commit()

            service1 = ConversationService(session1)
            service2 = ConversationService(session2)

            execution_order = []

            # First stream takes 100ms
            async def slow_stream_1(req):
                execution_order.append("stream1_start")
                await asyncio.sleep(0.1)
                execution_order.append("stream1_end")
                yield StreamingChunk(content="Ans 1", finish_reason="stop")

            # Second stream is quick
            async def fast_stream_2(req):
                execution_order.append("stream2_start")
                execution_order.append("stream2_end")
                yield StreamingChunk(content="Ans 2", finish_reason="stop")

            mock_prov1 = MagicMock()
            mock_prov1.get_default_model.return_value = "llama3.1:8b"
            mock_prov1.stream = slow_stream_1

            mock_prov2 = MagicMock()
            mock_prov2.get_default_model.return_value = "llama3.1:8b"
            mock_prov2.stream = fast_stream_2

            req1 = ChatRequest(conversation_id=conv.id, companion_id=comp.id, message="Turn 1")
            req2 = ChatRequest(conversation_id=conv.id, companion_id=comp.id, message="Turn 2")

            call_count = 0

            def get_prov(provider_type=None):
                nonlocal call_count
                call_count += 1
                return mock_prov1 if call_count == 1 else mock_prov2

            with patch("app.services.conversation.get_provider", side_effect=get_prov):
                async def run_turn(service, req):
                    res = []
                    async for ev in service.chat_stream(user.id, req):
                        res.append(ev)
                    return res

                # Launch both concurrently
                t1 = asyncio.create_task(run_turn(service1, req1))
                # Give t1 a moment to acquire lock
                await asyncio.sleep(0.01)
                t2 = asyncio.create_task(run_turn(service2, req2))

                await asyncio.gather(t1, t2)

            # Stream 2 MUST NOT start until Stream 1 completes its critical section
            assert execution_order == ["stream1_start", "stream1_end", "stream2_start", "stream2_end"]


# ==============================================================================
# 8. HTTP API SSE Streaming Endpoint Wire Format Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_sse_endpoint_wire_format(monkeypatch):
    """Verify POST /api/v1/conversations/chat returns proper Server-Sent Events when stream: true."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(email=f"sse_wire_{uuid4()}@example.com", password_hash="hash", full_name="Wire User")
        session.add(user)
        await session.flush()

        comp = Companion(user_id=user.id, name="SSE Comp", system_prompt="Sys", llm_config={"provider": "ollama"})
        session.add(comp)
        await session.commit()

        token = create_access_token(data={"sub": str(user.id)})

        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def stream_chunks(req):
            yield StreamingChunk(content="chunk_one ", finish_reason=None)
            yield StreamingChunk(content="chunk_two", finish_reason="stop")

        mock_provider.stream = stream_chunks

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                with patch("app.services.conversation.get_provider", return_value=mock_provider):
                    response = await client.post(
                        "/api/v1/conversations/chat",
                        headers={"Authorization": f"Bearer {token}"},
                        json={
                            "companion_id": str(comp.id),
                            "message": "Send me SSE",
                            "stream": True,
                        },
                    )

                    assert response.status_code == 200
                    assert "text/event-stream" in response.headers.get("content-type", "")

                    body_text = response.text
                    assert "event: start\n" in body_text
                    assert "event: chunk\n" in body_text
                    assert "chunk_one " in body_text
                    assert "chunk_two" in body_text
                    assert "event: completion\n" in body_text
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chat_sse_dedicated_stream_endpoint(monkeypatch):
    """Verify POST /api/v1/conversations/chat/stream works identically to stream: true."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(email=f"sse_alias_{uuid4()}@example.com", password_hash="hash", full_name="Alias User")
        session.add(user)
        await session.flush()

        comp = Companion(user_id=user.id, name="SSE Alias Comp", system_prompt="Sys", llm_config={"provider": "ollama"})
        session.add(comp)
        await session.commit()

        token = create_access_token(data={"sub": str(user.id)})

        mock_provider = MagicMock()
        mock_provider.get_default_model.return_value = "llama3.1:8b"

        async def stream_chunks(req):
            yield StreamingChunk(content="alias chunk", finish_reason="stop")

        mock_provider.stream = stream_chunks

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                with patch("app.services.conversation.get_provider", return_value=mock_provider):
                    response = await client.post(
                        "/api/v1/conversations/chat/stream",
                        headers={"Authorization": f"Bearer {token}"},
                        json={
                            "companion_id": str(comp.id),
                            "message": "Send me SSE via alias",
                        },
                    )

                    assert response.status_code == 200
                    assert "text/event-stream" in response.headers.get("content-type", "")
                    body_text = response.text
                    assert "event: start\n" in body_text
                    assert "event: chunk\n" in body_text
                    assert "alias chunk" in body_text
                    assert "event: completion\n" in body_text
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chat_stream_unauthenticated_returns_401():
    """Verify streaming endpoints reject unauthenticated requests with HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/conversations/chat",
            json={"companion_id": str(uuid4()), "message": "unauth", "stream": True},
        )
        assert response.status_code == 401

        alias_res = await client.post(
            "/api/v1/conversations/chat/stream",
            json={"companion_id": str(uuid4()), "message": "unauth"},
        )
        assert alias_res.status_code == 401
