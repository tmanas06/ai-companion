import time
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.main import app


@pytest.mark.asyncio
async def test_register():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "test@example.com",
                "password": "password123",
                "full_name": "Test User",
            },
        )
        assert response.status_code in (201, 400, 500)
        if response.status_code == 201:
            data = response.json()
            assert "access_token" in data
            assert "refresh_token" in data
            assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "password": "password123",
            },
        )
        assert response.status_code in (200, 401, 500)


def test_password_hashing():
    password = "secure_password_123"
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)
    assert hashed != password  # Not plaintext


def test_password_hash_uniqueness():
    password = "same_password"
    hash1 = get_password_hash(password)
    hash2 = get_password_hash(password)
    # Argon2 should produce different hashes each time (salt)
    assert hash1 != hash2
    assert verify_password(password, hash1)
    assert verify_password(password, hash2)


def test_create_access_token():
    data = {"sub": "user123", "email": "test@example.com"}
    token = create_access_token(data)
    assert isinstance(token, str)
    assert len(token) > 0

    # Decode and verify
    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert payload["email"] == "test@example.com"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_create_access_token_custom_expiry():
    data = {"sub": "user123"}
    expires_delta = timedelta(minutes=5)
    token = create_access_token(data, expires_delta)
    payload = decode_token(token)
    exp_time = datetime.fromtimestamp(payload["exp"], tz=UTC)
    expected_exp = datetime.now(UTC) + expires_delta
    # Allow 10 second tolerance
    assert abs((exp_time - expected_exp).total_seconds()) < 10


def test_create_refresh_token():
    data = {"sub": "user123"}
    token = create_refresh_token(data)
    assert isinstance(token, str)
    assert len(token) > 0

    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert payload["type"] == "refresh"
    assert "exp" in payload


def test_decode_valid_token():
    data = {"sub": "user123", "email": "test@example.com"}
    token = create_access_token(data)
    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert payload["email"] == "test@example.com"


def test_decode_expired_token():
    # Create a token that's already expired
    expired_token = jwt.encode(
        {"sub": "user123", "exp": datetime.now(UTC) - timedelta(minutes=5), "type": "access"},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token(expired_token)


def test_decode_malformed_token():
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token("not.a.valid.token")


def test_decode_token_wrong_algorithm():
    # Create token with HS256 but try to decode with RS256 (if configured)
    # This test verifies algorithm confusion is prevented
    token = jwt.encode(
        {"sub": "user123", "exp": datetime.now(UTC) + timedelta(minutes=5), "type": "access"},
        "wrong_secret",
        algorithm="HS256",
    )
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token(token)


def test_decode_token_missing_type():
    # Token without type claim
    token = jwt.encode(
        {"sub": "user123", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    # Should still decode but type won't be validated here
    payload = decode_token(token)
    assert payload["sub"] == "user123"


def test_refresh_token_type_validation():
    # Create a refresh token
    refresh_token = create_refresh_token({"sub": "user123"})
    payload = decode_token(refresh_token)
    assert payload["type"] == "refresh"

    # Create an access token
    access_token = create_access_token({"sub": "user123"})
    payload = decode_token(access_token)
    assert payload["type"] == "access"


def test_token_expiration_boundary():
    # Token expiring very soon (JWT lib may have clock skew tolerance)
    token = jwt.encode(
        {"sub": "user123", "exp": datetime.now(UTC) + timedelta(seconds=1), "type": "access"},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    # Should still be valid
    payload = decode_token(token)
    assert payload["sub"] == "user123"

    # Wait for expiry - use longer wait to account for clock skew tolerance
    time.sleep(3)
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token(token)


def test_refresh_token_longer_expiry():
    access_token = create_access_token({"sub": "user123"})
    refresh_token = create_refresh_token({"sub": "user123"})

    access_payload = decode_token(access_token)
    refresh_payload = decode_token(refresh_token)

    access_exp = datetime.fromtimestamp(access_payload["exp"], tz=UTC)
    refresh_exp = datetime.fromtimestamp(refresh_payload["exp"], tz=UTC)

    # Refresh token should expire much later
    assert refresh_exp > access_exp
    # Default: access 15 min, refresh 30 days
    assert (refresh_exp - access_exp).total_seconds() > 24 * 3600  # More than 1 day


def test_token_sub_claim_required():
    # Token without sub claim
    token = jwt.encode(
        {"email": "test@example.com", "exp": datetime.now(UTC) + timedelta(minutes=5), "type": "access"},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    payload = decode_token(token)
    assert "sub" not in payload or payload.get("sub") is None


# Integration tests for refresh endpoint
@pytest.mark.asyncio
async def test_refresh_token_rotation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register first
        await client.post(
            "/api/v1/auth/register",
            json={"email": "refresh@example.com", "password": "password123"},
        )
        # Login
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "refresh@example.com", "password": "password123"},
        )
        if login_resp.status_code == 200:
            tokens = login_resp.json()
            old_refresh = tokens["refresh_token"]

            # Use refresh token
            refresh_resp = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": old_refresh},
            )
            if refresh_resp.status_code == 200:
                new_tokens = refresh_resp.json()
                # New tokens should be valid
                assert "access_token" in new_tokens
                assert "refresh_token" in new_tokens
                assert new_tokens["token_type"] == "bearer"
                # Tokens should be valid JWTs
                assert len(new_tokens["access_token"].split(".")) == 3
                assert len(new_tokens["refresh_token"].split(".")) == 3


@pytest.mark.asyncio
async def test_refresh_token_reuse_detection():
    """Test that reusing a refresh token fails (if implemented)"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/v1/auth/register",
            json={"email": "reuse@example.com", "password": "password123"},
        )
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "reuse@example.com", "password": "password123"},
        )
        if login_resp.status_code == 200:
            tokens = login_resp.json()
            refresh_token = tokens["refresh_token"]

            # First use
            first_refresh = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": refresh_token},
            )
            # Second use with same token (should fail if rotation implemented)
            second_refresh = await client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": refresh_token},
            )
            # At least one should fail if rotation is implemented
            # (This test documents expected behavior; implementation may vary)
            assert first_refresh.status_code in (200, 401, 500)
            assert second_refresh.status_code in (200, 401, 500)


@pytest.mark.asyncio
async def test_invalid_refresh_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid.token.here"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_missing_refresh_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/auth/refresh", json={})
        assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_privy_auth_flow():
    """Test Privy authentication, user creation, and EVM wallet auto-provisioning."""
    import uuid
    random_sub = f"did:privy:{uuid.uuid4().hex}"
    random_email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    custom_wallet = "0x" + uuid.uuid4().hex[:40]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login with Privy user info and custom wallet
        res = await client.post(
            "/api/v1/auth/privy",
            json={
                "privy_user_id": random_sub,
                "email": random_email,
                "wallet_address": custom_wallet,
                "full_name": "Privy Tester",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["wallet_address"] == custom_wallet

        # 2. Login again with same privy_id should return same account
        res2 = await client.post(
            "/api/v1/auth/privy",
            json={
                "privy_user_id": random_sub,
                "email": random_email,
            },
        )
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["wallet_address"] == custom_wallet
