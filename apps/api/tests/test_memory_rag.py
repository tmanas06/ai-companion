"""Comprehensive tests for Milestone 1: Local Embeddings and Vector RAG."""

from datetime import UTC, datetime
import math
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.models import Companion, Conversation, Memory, Message, User
from app.models.user import ConsentStatus, MemorySource, MemoryType
from app.providers.embedding import (
    BaseEmbeddingProvider,
    MockEmbeddingProvider,
    OllamaEmbeddingProvider,
    get_embedding_provider,
)
from app.schemas.conversation import ChatRequest
from app.schemas.memory import ConsentRequest, MemoryCreate, MemoryUpdate
from app.services.conversation import ConversationService
from app.services.memory import MemoryService


# ==============================================================================
# 1. Embedding Provider Architecture & Validation Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_ollama_embedding_generation_success():
    """1. Successful embedding generation returns a 768-dim float vector."""
    provider = OllamaEmbeddingProvider(
        base_url="http://localhost:11434",
        model="nomic-embed-text",
        dimension=768,
    )

    dummy_vector = [0.01 * (i % 100) for i in range(768)]

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"models": [{"name": "nomic-embed-text:latest"}]},
                raise_for_status=lambda: None,
            )
        )
        mock_client.post = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"embeddings": [dummy_vector]},
                raise_for_status=lambda: None,
            )
        )
        mock_get_client.return_value = mock_client

        vector = await provider.embed("User loves science and reading.")
        assert len(vector) == 768
        assert all(isinstance(v, float) for v in vector)
        assert math.isclose(vector[0], 0.0, abs_tol=1e-5)


@pytest.mark.asyncio
async def test_ollama_embedding_fallback_to_legacy_api_embeddings():
    """2. If /api/embed returns 404, falls back to legacy /api/embeddings."""
    provider = OllamaEmbeddingProvider(
        base_url="http://localhost:11434",
        model="nomic-embed-text",
        dimension=768,
    )

    dummy_vector = [0.05] * 768

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"models": [{"name": "nomic-embed-text"}]},
                raise_for_status=lambda: None,
            )
        )

        def post_side_effect(url, **kwargs):
            if url == "/api/embed":
                return MagicMock(status_code=404)
            return MagicMock(
                status_code=200,
                json=lambda: {"embedding": dummy_vector},
                raise_for_status=lambda: None,
            )

        mock_client.post = AsyncMock(side_effect=post_side_effect)
        mock_get_client.return_value = mock_client

        vector = await provider.embed("Legacy Ollama test.")
        assert len(vector) == 768


@pytest.mark.asyncio
async def test_ollama_embedding_dimension_mismatch_raises_error():
    """3. Response vector dimension mismatch raises ProviderConfigurationError."""
    provider = OllamaEmbeddingProvider(
        base_url="http://localhost:11434",
        model="nomic-embed-text",
        dimension=768,
    )

    # Return 512 dimensions instead of 768
    wrong_dim_vector = [0.1] * 512

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"models": [{"name": "nomic-embed-text"}]},
                raise_for_status=lambda: None,
            )
        )
        mock_client.post = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"embeddings": [wrong_dim_vector]},
                raise_for_status=lambda: None,
            )
        )
        mock_get_client.return_value = mock_client

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.embed("Dimension mismatch test.")

        assert "dimension mismatch" in str(exc_info.value).lower()
        assert "512" in str(exc_info.value)
        assert "768" in str(exc_info.value)


@pytest.mark.asyncio
async def test_ollama_embedding_invalid_shape_raises_error():
    """4. Empty or invalid embedding payload raises ProviderConfigurationError."""
    provider = OllamaEmbeddingProvider(
        base_url="http://localhost:11434",
        model="nomic-embed-text",
        dimension=768,
    )

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"models": [{"name": "nomic-embed-text"}]},
                raise_for_status=lambda: None,
            )
        )
        mock_client.post = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"embeddings": []},  # Empty
                raise_for_status=lambda: None,
            )
        )
        mock_get_client.return_value = mock_client

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.embed("Empty response test.")

        assert "missing vector data" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_ollama_embedding_non_finite_values_raises_error():
    """5. Non-finite values (NaN/Inf) raise ProviderConfigurationError."""
    provider = OllamaEmbeddingProvider(
        base_url="http://localhost:11434",
        model="nomic-embed-text",
        dimension=768,
    )

    corrupted_vector = [0.1] * 767 + [float("nan")]

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"models": [{"name": "nomic-embed-text"}]},
                raise_for_status=lambda: None,
            )
        )
        mock_client.post = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"embeddings": [corrupted_vector]},
                raise_for_status=lambda: None,
            )
        )
        mock_get_client.return_value = mock_client

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.embed("Non-finite test.")

        assert "non-finite" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_ollama_embedding_missing_model_raises_error():
    """6. Missing model raises ProviderConfigurationError without auto-download."""
    provider = OllamaEmbeddingProvider(
        base_url="http://localhost:11434",
        model="nomic-embed-text",
        dimension=768,
    )

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        # Returns only unrelated models
        mock_client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"models": [{"name": "llama3.1:8b"}]},
                raise_for_status=lambda: None,
            )
        )
        mock_client.post = AsyncMock()
        mock_get_client.return_value = mock_client

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.embed("Missing model test.")

        assert "not installed in Ollama" in str(exc_info.value)
        # Verify /api/pull was NEVER called
        pull_calls = [c for c in mock_client.post.call_args_list if "/api/pull" in str(c)]
        assert len(pull_calls) == 0


@pytest.mark.asyncio
async def test_ollama_embedding_server_unreachable_raises_error():
    """7. Unreachable server raises ProviderConfigurationError."""
    provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_get_client.return_value = mock_client

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.embed("Unreachable test.")

        assert "unreachable" in str(exc_info.value).lower()


def test_embedding_privacy_enforcement(monkeypatch):
    """8. Privacy enforcement prohibits hosted providers and remote endpoints in local modes."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "strict-local")

    # Prohibited hosted providers
    with pytest.raises(PrivacyViolationError):
        get_embedding_provider(provider_type="openai")
    with pytest.raises(PrivacyViolationError):
        get_embedding_provider(provider_type="anthropic")

    # Prohibited remote endpoint in strict-local
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://192.168.1.100:11434")
    with pytest.raises(PrivacyViolationError):
        get_embedding_provider(provider_type="ollama")

    # Permitted loopback in strict-local
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    provider = get_embedding_provider(provider_type="ollama")
    assert provider.provider_type == "ollama"


def test_mock_embedding_provider_deterministic():
    """9. Mock embedding provider returns deterministic, unit-normalized vectors."""
    provider = MockEmbeddingProvider(dimension=768)

    import asyncio

    vec1 = asyncio.run(provider.embed("Antigravity AI companion"))
    vec2 = asyncio.run(provider.embed("Antigravity AI companion"))
    vec3 = asyncio.run(provider.embed("Completely different string"))

    assert len(vec1) == 768
    assert vec1 == vec2  # Exact deterministic match
    assert vec1 != vec3  # Different inputs produce different vectors

    # Unit normalized: sum of squares ≈ 1.0
    norm = math.sqrt(sum(v * v for v in vec1))
    assert math.isclose(norm, 1.0, rel_tol=1e-5)


def test_mock_embedding_provider_disabled_in_production():
    """10. Mock embedding provider cannot be instantiated in production."""
    with pytest.raises(ProviderConfigurationError):
        MockEmbeddingProvider(dimension=768, environment="production")


# ==============================================================================
# 2. Memory Lifecycle and Consent Tests (Using PostgreSQL/pgvector Database)
# ==============================================================================


@pytest.fixture
def mock_embedder():
    return MockEmbeddingProvider(dimension=768, environment="test")


@pytest.mark.asyncio
async def test_create_auto_approved_memory_generates_and_stores_embedding(mock_embedder):
    """11. Auto-approved memory generates and commits a 768-dim vector."""
    async with async_session_maker() as session:
        user = User(
            email=f"mem_auto_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Auto Mem User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)
        mem = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="User enjoys hiking on weekends.",
                memory_type="preference",
                source="user_explicit",
                is_sensitive=False,
            ),
        )

        assert mem.consent_status == "auto_approved"
        assert mem.embedding is not None
        assert len(mem.embedding) == 768

        # Query directly from DB
        db_mem = await session.get(Memory, mem.id)
        assert db_mem is not None
        assert db_mem.embedding is not None
        assert len(db_mem.embedding) == 768


@pytest.mark.asyncio
async def test_create_sensitive_memory_defers_embedding(mock_embedder):
    """12. Sensitive pending memory does NOT generate or store an embedding."""
    async with async_session_maker() as session:
        user = User(
            email=f"mem_sens_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Sensitive User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)
        mem = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="User medical health condition.",
                memory_type="fact",
                source="user_explicit",
                is_sensitive=True,
            ),
        )

        assert mem.consent_status == "pending"
        assert mem.embedding is None


@pytest.mark.asyncio
async def test_approve_sensitive_memory_generates_embedding(mock_embedder):
    """13. Approving a sensitive memory generates and stores an embedding."""
    async with async_session_maker() as session:
        user = User(
            email=f"mem_appr_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Approve User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)
        mem = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="User private project roadmap.",
                memory_type="goal",
                source="user_explicit",
                is_sensitive=True,
            ),
        )
        assert mem.embedding is None

        # Approve consent
        approved = await service.handle_consent(
            user.id,
            ConsentRequest(memory_id=mem.id, action="approve"),
        )

        assert approved.consent_status == "approved"
        assert approved.embedding is not None
        assert len(approved.embedding) == 768


@pytest.mark.asyncio
async def test_failed_approval_leaves_memory_pending():
    """14. If embedding generation fails on approval, memory remains pending."""
    failing_embedder = MagicMock(spec=BaseEmbeddingProvider)
    failing_embedder.embed = AsyncMock(
        side_effect=ProviderConfigurationError("Ollama offline")
    )
    failing_embedder.dimension = 768

    async with async_session_maker() as session:
        user = User(
            email=f"mem_fail_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Fail Appr User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        # Create sensitive memory (no embedding generated yet)
        service = MemoryService(session, embedding_provider=failing_embedder)
        mem = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="Pending sensitive item.",
                memory_type="fact",
                source="user_explicit",
                is_sensitive=True,
            ),
        )
        assert mem.consent_status == "pending"

        # Approval fails
        with pytest.raises(ProviderConfigurationError):
            await service.handle_consent(
                user.id,
                ConsentRequest(memory_id=mem.id, action="approve"),
            )

        # Assert DB record remains pending
        db_mem = await session.get(Memory, mem.id)
        assert db_mem is not None
        assert db_mem.consent_status == ConsentStatus.PENDING
        assert db_mem.embedding is None


@pytest.mark.asyncio
async def test_deny_sensitive_memory_clears_embedding_and_soft_deletes(mock_embedder):
    """15. Denying consent sets status=denied, sets deleted_at, and clears embedding."""
    async with async_session_maker() as session:
        user = User(
            email=f"mem_deny_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Deny User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)
        mem = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="Deny this sensitive item.",
                memory_type="fact",
                source="user_explicit",
                is_sensitive=True,
            ),
        )

        denied = await service.handle_consent(
            user.id,
            ConsentRequest(memory_id=mem.id, action="deny"),
        )

        assert denied.consent_status == "denied"
        assert denied.deleted_at is not None
        assert denied.embedding is None


@pytest.mark.asyncio
async def test_update_memory_content_regenerates_embedding(mock_embedder):
    """16. Content edit on approved memory regenerates its vector."""
    async with async_session_maker() as session:
        user = User(
            email=f"mem_upd_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Update User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)
        mem = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="Original text.",
                memory_type="fact",
                source="user_explicit",
                is_sensitive=False,
            ),
        )
        original_vector = list(mem.embedding)

        # Update content
        updated = await service.update_memory(
            user.id,
            mem.id,
            MemoryUpdate(content="Completely new text content."),
        )

        assert updated is not None
        assert updated.content == "Completely new text content."
        assert updated.embedding != original_vector


@pytest.mark.asyncio
async def test_delete_and_supersede_memory_clears_searchability(mock_embedder):
    """17. Soft-deleted and superseded memories clear embeddings and are excluded."""
    async with async_session_maker() as session:
        user = User(
            email=f"mem_del_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Del User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)
        mem1 = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="To be deleted.",
                memory_type="fact",
                source="user_explicit",
                is_sensitive=False,
            ),
        )
        mem2 = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="To be superseded.",
                memory_type="preference",
                source="user_explicit",
                is_sensitive=False,
            ),
        )

        # Delete mem1
        deleted = await service.delete_memory(user.id, mem1.id)
        assert deleted is True

        # Supersede mem2
        new_mem = await service.supersede_memory(
            user.id,
            mem2.id,
            MemoryCreate(
                companion_id=companion.id,
                content="Replacement preference.",
                memory_type="preference",
                source="user_explicit",
                is_sensitive=False,
            ),
        )

        # In DB: mem1 and mem2 should have deleted_at NOT NULL and embedding IS NULL
        db_mem1 = await session.get(Memory, mem1.id)
        db_mem2 = await session.get(Memory, mem2.id)

        assert db_mem1.deleted_at is not None
        assert db_mem1.embedding is None

        assert db_mem2.deleted_at is not None
        assert db_mem2.embedding is None
        assert db_mem2.superseded_by == new_mem.id


# ==============================================================================
# 3. Semantic Vector Search Database Tests (PostgreSQL/pgvector)
# ==============================================================================


@pytest.mark.asyncio
async def test_vector_search_cosine_ranking_and_threshold(mock_embedder):
    """18. Vector search orders results by cosine distance and respects threshold."""
    async with async_session_maker() as session:
        user = User(
            email=f"vec_rank_{uuid4()}@example.com",
            password_hash="hash",
            full_name="Rank User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)

        # Create exact match memory
        query_text = "Coffee preference: dark roast espresso"
        mem_exact = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content=query_text,
                memory_type="preference",
                source="user_explicit",
                is_sensitive=False,
            ),
        )

        # Create distant memory
        mem_distant = await service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content="Automotive mechanics: brake pad inspection",
                memory_type="fact",
                source="user_explicit",
                is_sensitive=False,
            ),
        )

        query_vector = await mock_embedder.embed(query_text)

        # Strict threshold search (threshold=0.1) -> should only return exact match
        strict_results = await service.search_similar_memories(
            user_id=user.id,
            companion_id=companion.id,
            query_vector=query_vector,
            limit=5,
            threshold=0.1,
        )
        assert len(strict_results) == 1
        assert strict_results[0].id == mem_exact.id

        # Wider threshold search -> both returned, but exact match ranked first
        wide_results = await service.search_similar_memories(
            user_id=user.id,
            companion_id=companion.id,
            query_vector=query_vector,
            limit=5,
            threshold=1.5,
        )
        assert len(wide_results) == 2
        assert wide_results[0].id == mem_exact.id


@pytest.mark.asyncio
async def test_vector_search_user_and_companion_isolation(mock_embedder):
    """19. Search strictly isolates by authenticated user and companion."""
    async with async_session_maker() as session:
        user_a = User(email=f"user_a_{uuid4()}@example.com", password_hash="hash", full_name="User A")
        user_b = User(email=f"user_b_{uuid4()}@example.com", password_hash="hash", full_name="User B")
        session.add(user_a)
        session.add(user_b)
        await session.flush()

        comp_a1 = Companion(user_id=user_a.id, name="Comp A1", system_prompt="Sys")
        comp_a2 = Companion(user_id=user_a.id, name="Comp A2", system_prompt="Sys")
        comp_b = Companion(user_id=user_b.id, name="Comp B", system_prompt="Sys")
        session.add(comp_a1)
        session.add(comp_a2)
        session.add(comp_b)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)

        content = "Common shared secret concept"
        mem_a1 = await service.create_memory(
            user_a.id,
            MemoryCreate(companion_id=comp_a1.id, content=content, memory_type="fact", source="user_explicit"),
        )
        await service.create_memory(
            user_a.id,
            MemoryCreate(companion_id=comp_a2.id, content=content, memory_type="fact", source="user_explicit"),
        )
        await service.create_memory(
            user_b.id,
            MemoryCreate(companion_id=comp_b.id, content=content, memory_type="fact", source="user_explicit"),
        )

        query_vec = await mock_embedder.embed(content)

        # Searching for User A, Companion A1 should ONLY return mem_a1
        results = await service.search_similar_memories(
            user_id=user_a.id,
            companion_id=comp_a1.id,
            query_vector=query_vec,
            limit=10,
            threshold=1.0,
        )
        assert len(results) == 1
        assert results[0].id == mem_a1.id


@pytest.mark.asyncio
async def test_vector_search_consent_filtering(mock_embedder):
    """20. Only approved/auto_approved memories are returned; pending/denied are excluded."""
    async with async_session_maker() as session:
        user = User(email=f"consent_vec_{uuid4()}@example.com", password_hash="hash", full_name="Consent User")
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)

        # Approved
        appr_mem = await service.create_memory(
            user.id,
            MemoryCreate(companion_id=companion.id, content="Approved fact", memory_type="fact", source="user_explicit", is_sensitive=False),
        )

        # Pending
        await service.create_memory(
            user.id,
            MemoryCreate(companion_id=companion.id, content="Pending sensitive", memory_type="fact", source="user_explicit", is_sensitive=True),
        )

        # Create another and deny it
        to_deny = await service.create_memory(
            user.id,
            MemoryCreate(companion_id=companion.id, content="Denied sensitive", memory_type="fact", source="user_explicit", is_sensitive=True),
        )
        await service.handle_consent(user.id, ConsentRequest(memory_id=to_deny.id, action="deny"))

        query_vec = await mock_embedder.embed("General query")
        results = await service.search_similar_memories(
            user_id=user.id,
            companion_id=companion.id,
            query_vector=query_vec,
            limit=10,
            threshold=2.0,
        )

        assert len(results) == 1
        assert results[0].id == appr_mem.id


@pytest.mark.asyncio
async def test_vector_search_empty_and_dimension_validation(mock_embedder):
    """21. Empty results return cleanly; wrong dimension raises ValueError."""
    async with async_session_maker() as session:
        user = User(email=f"empty_vec_{uuid4()}@example.com", password_hash="hash", full_name="Empty User")
        session.add(user)
        await session.flush()

        companion = Companion(user_id=user.id, name="Comp", system_prompt="Sys")
        session.add(companion)
        await session.commit()

        service = MemoryService(session, embedding_provider=mock_embedder)

        # Empty search
        query_vec = [0.1] * 768
        results = await service.search_similar_memories(
            user_id=user.id,
            companion_id=companion.id,
            query_vector=query_vec,
            limit=5,
        )
        assert results == []

        # Wrong dimension (512 vs 768)
        with pytest.raises(ValueError) as exc_info:
            await service.search_similar_memories(
                user_id=user.id,
                companion_id=companion.id,
                query_vector=[0.1] * 512,
            )
        assert "dimension mismatch" in str(exc_info.value).lower()


# ==============================================================================
# 4. Conversation Integration & RAG Context Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_retrieves_and_injects_relevant_memories(monkeypatch, mock_embedder):
    """22. Approved memories are retrieved and injected into the LLM system prompt context."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", "mock")

    async with async_session_maker() as session:
        user = User(email=f"chat_rag_{uuid4()}@example.com", password_hash="hash", full_name="RAG User")
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="RAG Companion",
            system_prompt="You are a helpful assistant.",
            llm_config={"provider": "mock"},
        )
        session.add(companion)
        await session.commit()

        memory_service = MemoryService(session, embedding_provider=mock_embedder)
        # Store an approved memory relevant to prompt
        prompt = "I need tea recommendations."
        await memory_service.create_memory(
            user.id,
            MemoryCreate(
                companion_id=companion.id,
                content=prompt,
                memory_type="preference",
                source="user_explicit",
                is_sensitive=False,
            ),
        )

        conversation_service = ConversationService(session)

        with patch("app.providers.embedding.get_embedding_provider", return_value=mock_embedder):
            from app.providers.factory import get_provider
            provider = get_provider("mock")

            captured_requests = []
            original_complete = provider.complete

            async def mock_complete(req):
                captured_requests.append(req)
                return await original_complete(req)

            with patch.object(provider, "complete", side_effect=mock_complete):
                conv, user_msg, assist_msg = await conversation_service.chat(
                    user_id=user.id,
                    request=ChatRequest(companion_id=companion.id, message=prompt),
                )

        assert len(captured_requests) == 1
        req = captured_requests[0]

        # Verify context delimiter and memory injection in system_prompt
        assert "<context>" in req.system_prompt
        assert "Relevant memories about the user" in req.system_prompt
        assert "I need tea recommendations." in req.system_prompt
        assert "</context>" in req.system_prompt

        # Verify baseline prompt preserved
        assert "You are a helpful assistant." in req.system_prompt


@pytest.mark.asyncio
async def test_chat_proceeds_gracefully_when_embedding_fails(monkeypatch):
    """23. If embedding retrieval fails, chat proceeds unaugmented with full persistence."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", "mock")

    failing_embedder = MagicMock(spec=BaseEmbeddingProvider)
    failing_embedder.embed = AsyncMock(side_effect=ProviderConfigurationError("Ollama embedding service down"))

    async with async_session_maker() as session:
        user = User(email=f"chat_fail_{uuid4()}@example.com", password_hash="hash", full_name="Fail User")
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Graceful Companion",
            system_prompt="Baseline assistant prompt.",
            llm_config={"provider": "mock"},
        )
        session.add(companion)
        await session.commit()

        conversation_service = ConversationService(session)

        with patch("app.providers.embedding.get_embedding_provider", return_value=failing_embedder):
            conv, user_msg, assist_msg = await conversation_service.chat(
                user_id=user.id,
                request=ChatRequest(companion_id=companion.id, message="Hello assistant"),
            )

        # Successful unaugmented turn: messages are persisted
        assert user_msg.id is not None
        assert assist_msg.id is not None
        assert conv.message_count == 2

        # Verify in DB
        db_messages = (
            await session.execute(select(Message).where(Message.conversation_id == conv.id))
        ).scalars().all()
        assert len(db_messages) == 2
