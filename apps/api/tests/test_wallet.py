"""Unit tests for the EVM wallet creation, address derivation, and encryption service."""

import pytest
from app.services.wallet import (
    keccak256,
    to_checksum_address,
    generate_evm_wallet,
    encrypt_private_key,
    decrypt_private_key,
    create_and_encrypt_wallet,
)


def test_keccak256_official_test_vectors():
    """Test Keccak-256 against official standard test vectors."""
    # Empty string
    assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    # "The quick brown fox jumps over the lazy dog"
    fox = b"The quick brown fox jumps over the lazy dog"
    assert keccak256(fox).hex() == "4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15"


def test_eip55_checksum_address():
    """Test EIP-55 mixed-case checksum address formatting."""
    # Official EIP-55 test vector
    raw = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"
    expected = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
    assert to_checksum_address(raw) == expected


def test_generate_evm_wallet():
    """Test EVM keypair and address generation."""
    addr, priv = generate_evm_wallet()
    assert addr.startswith("0x")
    assert len(addr) == 42
    assert len(priv) == 64
    # Hexadecimal
    int(priv, 16)


def test_wallet_uniqueness():
    """Ensure two generated wallets are distinct."""
    addr1, priv1 = generate_evm_wallet()
    addr2, priv2 = generate_evm_wallet()
    assert addr1 != addr2
    assert priv1 != priv2


def test_encrypt_decrypt_roundtrip():
    """Test private key encryption and decryption using AES-256-GCM."""
    _, priv = generate_evm_wallet()
    encrypted = encrypt_private_key(priv)
    assert encrypted != priv
    assert ":" in encrypted

    decrypted = decrypt_private_key(encrypted)
    assert decrypted == priv


def test_create_and_encrypt_wallet():
    """Test combined create and encrypt function."""
    addr, enc_key = create_and_encrypt_wallet()
    assert addr.startswith("0x")
    assert len(addr) == 42
    decrypted = decrypt_private_key(enc_key)
    assert len(decrypted) == 64


def test_decrypt_invalid_payload():
    """Test decryption error handling for invalid payloads."""
    with pytest.raises(ValueError):
        decrypt_private_key("invalid_no_colon")
