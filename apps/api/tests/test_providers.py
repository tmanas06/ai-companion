"""Tests for AI provider selection, privacy enforcement, and error handling."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker
from app.core.exceptions import PrivacyViolationError, ProviderConfigurationError
from app.core.security import get_current_user
from app.main import app
from app.models import Companion, Conversation, Message, User
from app.schemas.conversation import ChatRequest
from app.providers import (
    AnthropicProvider,
    CompletionRequest,
    CompletionResponse,
    MockProvider,
    OllamaProvider,
    OpenAIProvider,
    ProviderRegistry,
    ProviderType,
    get_provider,
    initialize_default_providers,
    initialize_providers,
    is_loopback_endpoint,
    validate_provider_privacy,
)
from app.providers.anthropic_provider import AnthropicProvider as CanonicalAnthropicProvider
from app.services.conversation import ConversationService, get_conversation_service


# ==============================================================================
# 1. Canonical Imports and Interface Tests
# ==============================================================================


def test_canonical_anthropic_import():
    """Verify AnthropicProvider is imported from its canonical module and not duplicated in openai_provider."""
    import app.providers.openai_provider as openai_mod

    assert AnthropicProvider is CanonicalAnthropicProvider
    assert not hasattr(openai_mod, "AnthropicProvider")


# ==============================================================================
# 2. Locality and Endpoint Verification Tests
# ==============================================================================


def test_is_loopback_endpoint():
    """Verify loopback endpoint detection handles loopback, remote IPs, and invalid hosts."""
    # Loopback addresses (accepted)
    assert is_loopback_endpoint("http://localhost:11434") is True
    assert is_loopback_endpoint("https://localhost:11434") is True
    assert is_loopback_endpoint("http://127.0.0.1:11434") is True
    assert is_loopback_endpoint("http://127.0.0.2:11434") is True
    assert is_loopback_endpoint("http://[::1]:11434") is True
    assert is_loopback_endpoint("localhost:11434") is True
    assert is_loopback_endpoint("127.0.0.1") is True
    assert is_loopback_endpoint("[::1]") is True

    # Rejection of arbitrary DNS hostnames in strict-local (DNS rebinding prevention)
    assert is_loopback_endpoint("http://ollama.local:11434") is False
    assert is_loopback_endpoint("https://ollama.company.internal") is False
    assert is_loopback_endpoint("http://unresolvable-domain-xyz-987.org:11434") is False

    # Rejection of embedded credentials
    assert is_loopback_endpoint("http://user:pass@localhost:11434") is False
    assert is_loopback_endpoint("http://user:pass@127.0.0.1:11434") is False

    # Rejection of non-HTTP schemes
    assert is_loopback_endpoint("ftp://127.0.0.1:11434") is False
    assert is_loopback_endpoint("ws://127.0.0.1:11434") is False
    assert is_loopback_endpoint("file:///localhost") is False

    # Remote, LAN, or public addresses - must be False
    assert is_loopback_endpoint("http://192.168.1.50:11434") is False
    assert is_loopback_endpoint("http://10.0.0.1:11434") is False
    assert is_loopback_endpoint("https://api.openai.com") is False
    assert is_loopback_endpoint("http://1.1.1.1:11434") is False
    assert is_loopback_endpoint("http://[2606:4700::1]:11434") is False
    assert is_loopback_endpoint("http://0.0.0.0:11434") is False

    # Malformed URLs or invalid ports - fail closed
    assert is_loopback_endpoint("http://127.0.0.1:99999") is False
    assert is_loopback_endpoint("") is False
    assert is_loopback_endpoint(None) is False


def test_private_machine_permits_user_managed_endpoints():
    """Verify private-machine permits remote user-managed Ollama endpoints while blocking cloud."""
    # Should not raise for LAN or custom user machine
    validate_provider_privacy("ollama", "private-machine", "http://192.168.1.50:11434")
    validate_provider_privacy("ollama", "private-machine", "http://gpu-rig.local:11434")

    # Cloud providers still prohibited under private-machine
    with pytest.raises(PrivacyViolationError):
        validate_provider_privacy("openai", "private-machine")
    with pytest.raises(PrivacyViolationError):
        validate_provider_privacy("anthropic", "private-machine")


def test_strict_local_fails_closed_in_production_deployments():
    """Verify strict-local rejects remote server environments even on loopback endpoints."""
    with pytest.raises(PrivacyViolationError) as exc_info:
        validate_provider_privacy(
            "ollama",
            "strict-local",
            "http://localhost:11434",
            environment="production",
        )
    assert "remote server deployment" in str(exc_info.value)


# ==============================================================================
# 3. Provider Selection & Registration Tests
# ==============================================================================


def test_default_private_machine_selects_ollama(monkeypatch):
    """1. Default private-machine configuration selects Ollama when configured."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", None)

    reg = initialize_providers()
    provider = get_provider(registry=reg)

    assert isinstance(provider, OllamaProvider)
    assert provider.provider_type == ProviderType.OLLAMA


def test_ollama_registered_during_normal_initialization(monkeypatch):
    """2. Ollama is correctly registered during normal application initialization."""
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")

    reg = initialize_default_providers()
    assert ProviderType.OLLAMA in reg._providers
    assert isinstance(reg.get(ProviderType.OLLAMA), OllamaProvider)


def test_openai_api_key_alone_does_not_select_openai(monkeypatch):
    """3. An OpenAI API key alone does not select OpenAI."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-proj-testkey123")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", None)

    reg = initialize_providers()
    provider = get_provider(registry=reg)

    # In private-machine mode, Ollama is selected, NOT OpenAI
    assert isinstance(provider, OllamaProvider)
    assert provider.provider_type == ProviderType.OLLAMA


def test_anthropic_api_key_alone_does_not_select_anthropic(monkeypatch):
    """4. An Anthropic API key alone does not select Anthropic."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-testkey123")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", None)

    reg = initialize_providers()
    provider = get_provider(registry=reg)

    # In private-machine mode, Ollama is selected, NOT Anthropic
    assert isinstance(provider, OllamaProvider)
    assert provider.provider_type == ProviderType.OLLAMA


# ==============================================================================
# 4. Privacy Enforcement Tests (Fail-Closed Boundaries)
# ==============================================================================


def test_private_machine_rejects_explicit_openai(monkeypatch):
    """5. private-machine rejects explicit OpenAI selection."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-proj-testkey123")

    reg = initialize_providers()
    with pytest.raises(PrivacyViolationError) as exc_info:
        get_provider(provider_type="openai", registry=reg)

    assert "prohibited under private-machine" in str(exc_info.value)


def test_private_machine_rejects_explicit_anthropic(monkeypatch):
    """6. private-machine rejects explicit Anthropic selection."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-testkey123")

    reg = initialize_providers()
    with pytest.raises(PrivacyViolationError) as exc_info:
        get_provider(provider_type="anthropic", registry=reg)

    assert "prohibited under private-machine" in str(exc_info.value)


def test_missing_ollama_configuration_raises_error(monkeypatch):
    """7. Missing Ollama configuration raises ProviderConfigurationError."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", None)

    reg = initialize_providers()
    with pytest.raises(ProviderConfigurationError) as exc_info:
        get_provider(registry=reg)

    assert "OLLAMA_BASE_URL is not set" in str(exc_info.value) or "Ollama is not configured" in str(exc_info.value)


@pytest.mark.asyncio
async def test_unavailable_ollama_raises_error_without_trying_cloud(monkeypatch):
    """8. Unavailable Ollama raises an error without trying cloud providers."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test-secret-key")

    provider = OllamaProvider(base_url="http://localhost:11434")

    # Mock client connecting to Ollama to simulate server down
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_get_client.return_value = mock_client

        req = CompletionRequest(
            messages=[{"role": "user", "content": "Hello"}],
            model="llama3.1:8b",
        )

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.complete(req)

        assert "unreachable" in str(exc_info.value)


def test_strict_local_rejects_hosted_providers(monkeypatch):
    """9. strict-local rejects hosted providers."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "strict-local")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test")

    reg = initialize_providers()

    with pytest.raises(PrivacyViolationError) as exc1:
        get_provider(provider_type="openai", registry=reg)
    assert "strict-local" in str(exc1.value)

    with pytest.raises(PrivacyViolationError) as exc2:
        get_provider(provider_type="anthropic", registry=reg)
    assert "strict-local" in str(exc2.value)


def test_strict_local_rejects_remote_ollama_endpoints(monkeypatch):
    """10. strict-local rejects remote Ollama endpoints."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "strict-local")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://192.168.1.100:11434")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", None)

    reg = initialize_providers()

    with pytest.raises(PrivacyViolationError) as exc_info:
        get_provider(provider_type="ollama", registry=reg)

    assert "Remote Ollama endpoint" in str(exc_info.value)
    assert "strict-local" in str(exc_info.value)


def test_strict_local_fails_closed_when_locality_unverified(monkeypatch):
    """11. strict-local fails closed when locality cannot be verified."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "strict-local")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://unresolvable-domain-test.local:11434")

    reg = initialize_providers()

    with pytest.raises(PrivacyViolationError) as exc_info:
        get_provider(provider_type="ollama", registry=reg)

    assert "strict-local" in str(exc_info.value)


def test_cloud_allowed_requires_explicit_provider_choice(monkeypatch):
    """12. cloud-allowed requires an explicit provider choice."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "cloud-allowed")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", None)

    reg = initialize_providers()

    # Calling without an explicit provider choice must fail
    with pytest.raises(ProviderConfigurationError) as exc_info:
        get_provider(registry=reg)

    assert "explicit provider must be specified" in str(exc_info.value)

    # Calling with explicit provider choice succeeds
    provider = get_provider(provider_type="openai", registry=reg)
    assert isinstance(provider, OpenAIProvider)


def test_explicit_mock_mode_in_isolated_tests(monkeypatch):
    """13. Explicit mock mode works in isolated tests."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")

    reg = ProviderRegistry()
    mock_prov = MockProvider()
    reg.register(mock_prov)

    provider = get_provider(provider_type="mock", registry=reg)
    assert isinstance(provider, MockProvider)
    assert provider.provider_type == ProviderType.MOCK


def test_production_configuration_does_not_silently_return_mock(monkeypatch):
    """14. Production configuration does not silently return MockProvider."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)

    reg = ProviderRegistry()
    reg.register(MockProvider())

    # In production without Ollama configured, must raise ProviderConfigurationError, NOT return Mock
    with pytest.raises(ProviderConfigurationError):
        get_provider(registry=reg)

    # Even explicit request for mock in production must be rejected
    with pytest.raises(ProviderConfigurationError) as exc_info:
        get_provider(provider_type="mock", registry=reg)

    assert "disabled in production" in str(exc_info.value)


@pytest.mark.asyncio
async def test_privacy_violation_occurs_before_prompt_transmitted(monkeypatch):
    """15. Privacy violations occur before the prohibited provider receives a prompt."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-fake-secret")

    openai_provider = OpenAIProvider(api_key="sk-fake-secret")
    openai_provider.complete = AsyncMock()

    reg = ProviderRegistry()
    reg.register(openai_provider)

    with pytest.raises(PrivacyViolationError):
        # Attempt to resolve OpenAI under private-machine
        get_provider(provider_type="openai", registry=reg)

    # Assert OpenAI completion was NEVER called
    openai_provider.complete.assert_not_called()


@pytest.mark.asyncio
async def test_companion_llm_config_cannot_bypass_privacy_mode(monkeypatch):
    """16. Companion llm_config cannot bypass the global privacy mode."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    # Mock session
    mock_session = AsyncMock()
    service = ConversationService(mock_session)

    # Companion with llm_config requesting OpenAI
    companion = MagicMock(spec=Companion)
    companion.llm_config = {"provider": "openai", "model": "gpt-4o"}
    companion.system_prompt = "You are an assistant"
    companion.user_id = "user-1"

    mock_session.get.return_value = companion

    # Setup mock conversation
    mock_conv = MagicMock(spec=Conversation)
    mock_conv.id = "conv-1"
    mock_conv.companion_id = "comp-1"

    service.get_conversation = AsyncMock(return_value=mock_conv)
    service.add_message = AsyncMock(return_value=MagicMock(spec=Message, id="msg-1", role="user", content="Hi"))
    service.get_recent_messages = AsyncMock(return_value=[MagicMock(role="user", content="Hi")])

    req = MagicMock()
    req.conversation_id = "conv-1"
    req.companion_id = None
    req.message = "Hello secret"

    with pytest.raises(PrivacyViolationError) as exc_info:
        await service.chat(user_id="user-1", request=req)

    assert "prohibited under private-machine" in str(exc_info.value)


@pytest.mark.asyncio
async def test_missing_ollama_model_does_not_trigger_api_pull():
    """17. A missing Ollama model does not trigger /api/pull."""
    provider = OllamaProvider(base_url="http://localhost:11434")

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        # Tags endpoint returns only llama3.1:8b
        mock_client.get = AsyncMock(return_value=MagicMock(
            status_code=200,
            json=lambda: {"models": [{"name": "llama3.1:8b"}]},
            raise_for_status=lambda: None,
        ))
        mock_client.post = AsyncMock()
        mock_get_client.return_value = mock_client

        req = CompletionRequest(
            messages=[{"role": "user", "content": "Hello"}],
            model="mistral:7b",  # Model not in tags
        )

        with pytest.raises(ProviderConfigurationError) as exc_info:
            await provider.complete(req)

        assert "not installed in Ollama" in str(exc_info.value)

        # CRITICAL: Verify /api/pull was NEVER called
        pull_calls = [c for c in mock_client.post.call_args_list if "/api/pull" in str(c)]
        assert len(pull_calls) == 0


# ==============================================================================
# 5. API Error Handling Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_api_returns_safe_error_for_privacy_violation(monkeypatch):
    """19a. Chat API returns HTTP 403 and error_type=privacy_violation via global handler."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    # Mock conversation service to raise PrivacyViolationError
    mock_service = MagicMock()
    mock_service.chat = AsyncMock(side_effect=PrivacyViolationError("Provider 'openai' is prohibited under private-machine mode."))

    app.dependency_overrides[get_conversation_service] = lambda: mock_service

    # Authenticate or mock current user
    mock_user = MagicMock(spec=User)
    mock_user.id = "user-123"
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/conversations/chat",
                json={
                    "conversation_id": "00000000-0000-0000-0000-000000000001",
                    "message": "My confidential user message",
                },
            )

            assert response.status_code == 403
            data = response.json()
            assert "prohibited under private-machine" in data["detail"]
            assert data["error_type"] == "privacy_violation"
            # Ensure confidential content was not leaked
            assert "My confidential user message" not in response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chat_api_returns_safe_error_for_provider_availability():
    """19b. Chat API returns HTTP 503 and error_type=provider_configuration_error via global handler."""
    mock_service = MagicMock()
    mock_service.chat = AsyncMock(
        side_effect=ProviderConfigurationError("Ollama server is unreachable at http://localhost:11434")
    )

    app.dependency_overrides[get_conversation_service] = lambda: mock_service
    mock_user = MagicMock(spec=User)
    mock_user.id = "user-123"
    app.dependency_overrides[get_current_user] = lambda: mock_user

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/conversations/chat",
                json={
                    "conversation_id": "00000000-0000-0000-0000-000000000001",
                    "message": "Hello AI",
                },
            )

            assert response.status_code == 503
            data = response.json()
            assert "unreachable" in data["detail"]
            assert data["error_type"] == "provider_configuration_error"
    finally:
        app.dependency_overrides.clear()


# ==============================================================================
# 6. Conversation State Integrity Tests (Real AsyncSession against test DB)
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_privacy_violation_persists_no_user_message(monkeypatch):
    """Priority 1.1: PrivacyViolationError before inference leaves no user message or conversation."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        # Create test user and companion with prohibited provider
        user = User(
            email=f"privacy_state_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="State User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Prohibited Companion",
            system_prompt="Test",
            llm_config={"provider": "openai"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)
        req = ChatRequest(companion_id=companion.id, message="Should not persist")

        with pytest.raises(PrivacyViolationError):
            await service.chat(user_id=user.id, request=req)

        # Assert NO message was persisted
        result = await session.execute(select(Message).where(Message.content == "Should not persist"))
        assert len(result.scalars().all()) == 0

        # Assert NO conversation was persisted
        conv_res = await session.execute(select(Conversation).where(Conversation.companion_id == companion.id))
        assert len(conv_res.scalars().all()) == 0


@pytest.mark.asyncio
async def test_chat_provider_configuration_error_persists_no_user_message(monkeypatch):
    """Priority 1.2: ProviderConfigurationError leaves no user message."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", None)

    async with async_session_maker() as session:
        user = User(
            email=f"config_state_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Config User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Config Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)
        req = ChatRequest(companion_id=companion.id, message="Config error message")

        with pytest.raises(ProviderConfigurationError):
            await service.chat(user_id=user.id, request=req)

        # Assert NO message was persisted
        result = await session.execute(select(Message).where(Message.content == "Config error message"))
        assert len(result.scalars().all()) == 0


@pytest.mark.asyncio
async def test_chat_inference_failure_persists_no_user_message(monkeypatch):
    """Priority 1.3: Inference failure after resolution does not leave an unfulfilled user message."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")

    async with async_session_maker() as session:
        user = User(
            email=f"infer_fail_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Infer Fail User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Infer Fail Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)

        # Mock provider completion to simulate inference failure (e.g. server crash during call)
        with patch("app.services.conversation.get_provider") as mock_get_provider:
            mock_prov = MagicMock()
            mock_prov.complete = AsyncMock(side_effect=ProviderConfigurationError("Ollama crashed mid-inference"))
            mock_prov.get_default_model.return_value = "llama3.1:8b"
            mock_get_provider.return_value = mock_prov

            req = ChatRequest(companion_id=companion.id, message="Message that should fail inference")
            with pytest.raises(ProviderConfigurationError):
                await service.chat(user_id=user.id, request=req)

        # Assert NO message was persisted
        result = await session.execute(select(Message).where(Message.content == "Message that should fail inference"))
        assert len(result.scalars().all()) == 0


@pytest.mark.asyncio
async def test_chat_success_message_count_consistency(monkeypatch):
    """Priority 1.4: message_count agrees with actual persisted messages on success."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(
            email=f"success_state_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Success User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Success Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.commit()
        await session.refresh(companion)

        service = ConversationService(session)

        with patch("app.services.conversation.get_provider") as mock_get_provider:
            mock_prov = MagicMock()
            mock_prov.complete = AsyncMock(return_value=CompletionResponse(
                content="Hello user from AI",
                model="llama3.1:8b",
                usage={"total_tokens": 12},
                finish_reason="stop",
            ))
            mock_prov.get_default_model.return_value = "llama3.1:8b"
            mock_get_provider.return_value = mock_prov

            req = ChatRequest(companion_id=companion.id, message="Hello AI companion")
            conv, u_msg, a_msg = await service.chat(user_id=user.id, request=req)

            assert conv.message_count == 2
            assert u_msg.content == "Hello AI companion"
            assert a_msg.content == "Hello user from AI"

            # Verify in DB directly
            result = await session.execute(select(Message).where(Message.conversation_id == conv.id))
            persisted = result.scalars().all()
            assert len(persisted) == 2
            assert conv.message_count == len(persisted)


@pytest.mark.asyncio
async def test_chat_failure_preserves_existing_history(monkeypatch):
    """Priority 1.5: Failure preserves existing conversation history and does not corrupt older turns."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(
            email=f"history_preserve_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="History User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="History Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.flush()

        conv = Conversation(user_id=user.id, companion_id=companion.id, message_count=2)
        session.add(conv)
        await session.flush()

        m1 = Message(conversation_id=conv.id, role="user", content="Turn 1 prompt", metadata_={})
        m2 = Message(conversation_id=conv.id, role="assistant", content="Turn 1 reply", metadata_={})
        session.add(m1)
        session.add(m2)
        await session.commit()

        # Turn 2 encounters privacy violation
        companion.llm_config = {"provider": "openai"}
        await session.commit()

        service = ConversationService(session)
        req = ChatRequest(conversation_id=conv.id, message="Turn 2 prohibited prompt")

        with pytest.raises(PrivacyViolationError):
            await service.chat(user_id=user.id, request=req)

        # Verify turn 1 messages remain intact
        result = await session.execute(select(Message).where(Message.conversation_id == conv.id))
        messages = result.scalars().all()
        assert len(messages) == 2
        assert [m.content for m in messages] == ["Turn 1 prompt", "Turn 1 reply"]


@pytest.mark.asyncio
async def test_chat_retry_does_not_duplicate_messages(monkeypatch):
    """Priority 1.6: Retrying a failed request does not duplicate the user message."""
    monkeypatch.setattr(settings, "PRIVACY_MODE", "private-machine")

    async with async_session_maker() as session:
        user = User(
            email=f"retry_state_{uuid4()}@example.com",
            password_hash="test-hash",
            full_name="Retry User",
        )
        session.add(user)
        await session.flush()

        companion = Companion(
            user_id=user.id,
            name="Retry Companion",
            system_prompt="Test",
            llm_config={"provider": "ollama"},
        )
        session.add(companion)
        await session.commit()

        service = ConversationService(session)

        # Attempt 1: inference fails
        with patch("app.services.conversation.get_provider") as mock_get_provider:
            mock_prov = MagicMock()
            mock_prov.complete = AsyncMock(side_effect=ProviderConfigurationError("Transient network failure"))
            mock_prov.get_default_model.return_value = "llama3.1:8b"
            mock_get_provider.return_value = mock_prov

            req = ChatRequest(companion_id=companion.id, message="Idempotent prompt")
            with pytest.raises(ProviderConfigurationError):
                await service.chat(user_id=user.id, request=req)

        # Attempt 2: retry succeeds
        with patch("app.services.conversation.get_provider") as mock_get_provider:
            mock_prov = MagicMock()
            mock_prov.complete = AsyncMock(return_value=CompletionResponse(
                content="Success response on retry",
                model="llama3.1:8b",
                usage={"total_tokens": 10},
                finish_reason="stop",
            ))
            mock_prov.get_default_model.return_value = "llama3.1:8b"
            mock_get_provider.return_value = mock_prov

            conv, u_msg, a_msg = await service.chat(user_id=user.id, request=req)
            assert conv.message_count == 2

            result = await session.execute(select(Message).where(Message.conversation_id == conv.id))
            persisted = result.scalars().all()
            assert len(persisted) == 2
            assert [m.content for m in persisted] == ["Idempotent prompt", "Success response on retry"]


# ==============================================================================
# 7. Cloud Provider Error Handling Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_openai_provider_handles_network_and_http_errors():
    """Verify OpenAIProvider translates connection and HTTP errors to ProviderConfigurationError."""
    provider = OpenAIProvider(api_key="sk-test-key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Network dropped"))
        mock_get_client.return_value = mock_client

        req = CompletionRequest(messages=[{"role": "user", "content": "hi"}], model="gpt-4o")
        with pytest.raises(ProviderConfigurationError) as exc:
            await provider.complete(req)
        assert "unreachable" in str(exc.value)

        # HTTP error test
        mock_response = MagicMock(status_code=401)
        mock_client.post = AsyncMock(
            side_effect=httpx.HTTPStatusError("Unauthorized", request=MagicMock(), response=mock_response)
        )
        with pytest.raises(ProviderConfigurationError) as exc2:
            await provider.complete(req)
        assert "401" in str(exc2.value)


@pytest.mark.asyncio
async def test_anthropic_provider_handles_network_and_http_errors():
    """Verify AnthropicProvider translates connection and HTTP errors to ProviderConfigurationError."""
    provider = AnthropicProvider(api_key="sk-ant-test-key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Network dropped"))
        mock_get_client.return_value = mock_client

        req = CompletionRequest(messages=[{"role": "user", "content": "hi"}], model="claude-3-haiku-20240307")
        with pytest.raises(ProviderConfigurationError) as exc:
            await provider.complete(req)
        assert "unreachable" in str(exc.value)

        # HTTP error test
        mock_response = MagicMock(status_code=429)
        mock_client.post = AsyncMock(
            side_effect=httpx.HTTPStatusError("Rate limited", request=MagicMock(), response=mock_response)
        )
        with pytest.raises(ProviderConfigurationError) as exc2:
            await provider.complete(req)
        assert "429" in str(exc2.value)
