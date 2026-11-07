"""EVM wallet creation and encryption service.

Provides native SECP256K1 keypair generation, EIP-55 checksummed Ethereum/Base/Polygon
address derivation via pure-Python Keccak-256, and AES-256-GCM authenticated encryption
for user key security.
"""

import hashlib
import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


# Keccak-256 constants for pure Python implementation
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]

_R = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]


def keccak256(data: bytes) -> bytes:
    """Compute standard Keccak-256 hash (FIPS 202 0x01 padding used by Ethereum)."""
    rate = 136  # 1088 bits / 8
    state = [[0] * 5 for _ in range(5)]
    pad_len = rate - (len(data) % rate)
    padded = data + (b"\x81" if pad_len == 1 else b"\x01" + b"\x00" * (pad_len - 2) + b"\x80")

    for block_idx in range(0, len(padded), rate):
        block = padded[block_idx : block_idx + rate]
        for i in range(17):
            idx = i * 8
            val = int.from_bytes(block[idx : idx + 8], "little")
            state[i % 5][i // 5] ^= val

        for round_idx in range(24):
            # Theta step
            C = [state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4] for x in range(5)]
            D = [C[(x - 1) % 5] ^ (((C[(x + 1) % 5] << 1) | (C[(x + 1) % 5] >> 63)) & 0xFFFFFFFFFFFFFFFF) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    state[x][y] ^= D[x]

            # Rho and Pi steps
            B = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    rot = _R[x][y]
                    val = state[x][y]
                    B[y][(2 * x + 3 * y) % 5] = ((val << rot) | (val >> (64 - rot))) & 0xFFFFFFFFFFFFFFFF if rot else val

            # Chi step
            for x in range(5):
                for y in range(5):
                    state[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])

            # Iota step
            state[0][0] ^= _RC[round_idx]

    out = bytearray()
    for i in range(4):
        out.extend(state[i % 5][i // 5].to_bytes(8, "little"))
    return bytes(out)


def to_checksum_address(address_hex: str) -> str:
    """Convert an Ethereum address hex string to EIP-55 mixed-case checksum format."""
    clean_addr = address_hex.lower().replace("0x", "")
    addr_hash = keccak256(clean_addr.encode("ascii")).hex()
    checksummed = ["0x"]
    for i, ch in enumerate(clean_addr):
        if ch in "0123456789":
            checksummed.append(ch)
        else:
            checksummed.append(ch.upper() if int(addr_hash[i], 16) >= 8 else ch.lower())
    return "".join(checksummed)


def _get_encryption_key() -> bytes:
    """Derive 256-bit AES-GCM key from settings.JWT_SECRET_KEY."""
    secret = settings.JWT_SECRET_KEY.encode("utf-8")
    return hashlib.sha256(secret).digest()


def encrypt_private_key(private_key_hex: str) -> str:
    """Encrypt private key hex string using AES-256-GCM."""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, private_key_hex.encode("utf-8"), None)
    return f"{nonce.hex()}:{ciphertext.hex()}"


def decrypt_private_key(encrypted_payload: str) -> str:
    """Decrypt AES-256-GCM encrypted private key string."""
    parts = encrypted_payload.split(":")
    if len(parts) != 2:
        raise ValueError("Invalid encrypted key format")
    nonce = bytes.fromhex(parts[0])
    ciphertext = bytes.fromhex(parts[1])
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    decrypted = aesgcm.decrypt(nonce, ciphertext, None)
    return decrypted.decode("utf-8")


def generate_evm_wallet() -> tuple[str, str]:
    """Generate a new standard EVM (Ethereum / Base / Polygon) keypair.
    
    Returns:
        tuple[str, str]: (EIP-55 checksummed address, 64-char private key hex)
    """
    priv = ec.generate_private_key(ec.SECP256K1())
    priv_int = priv.private_numbers().private_value
    priv_hex = f"{priv_int:064x}"

    nums = priv.public_key().public_numbers()
    pub_bytes = nums.x.to_bytes(32, "big") + nums.y.to_bytes(32, "big")
    raw_address = keccak256(pub_bytes)[-20:].hex()
    address = to_checksum_address(raw_address)
    return address, priv_hex


def create_and_encrypt_wallet() -> tuple[str, str]:
    """Create a new EVM wallet and return the address with encrypted private key.
    
    Returns:
        tuple[str, str]: (checksummed_address, encrypted_wallet_key)
    """
    address, priv_hex = generate_evm_wallet()
    encrypted_key = encrypt_private_key(priv_hex)
    return address, encrypted_key

