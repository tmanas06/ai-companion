import os

# Set test environment variables before importing app
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_companion")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only-do-not-use-in-production")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_PRIVATE_KEY_PATH", "./keys/jwt_private.pem")
os.environ.setdefault("JWT_PUBLIC_KEY_PATH", "./keys/jwt_public.pem")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LOG_LEVEL", "DEBUG")
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("TTS_PROVIDER", "mock")

# Clear settings cache to pick up new environment variables
import app.core.config as config_module

config_module.get_settings.cache_clear()

# Ensure keys directory exists
os.makedirs("./keys", exist_ok=True)

# Generate test keys if they don't exist
from pathlib import Path

private_key_path = Path("./keys/jwt_private.pem")
public_key_path = Path("./keys/jwt_public.pem")

if not private_key_path.exists() or not public_key_path.exists():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_key_path.write_bytes(private_pem)
    public_key_path.write_bytes(public_pem)
