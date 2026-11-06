from datetime import UTC, datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _get_signing_key():
    """Get the appropriate signing key based on the algorithm."""
    if settings.JWT_ALGORITHM.startswith("HS"):
        return settings.JWT_SECRET_KEY
    return load_private_key()


def _get_verification_key():
    """Get the appropriate verification key based on the algorithm."""
    if settings.JWT_ALGORITHM.startswith("HS"):
        return settings.JWT_SECRET_KEY
    return load_public_key()


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    signing_key = _get_signing_key()
    encoded_jwt = jwt.encode(to_encode, signing_key, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    signing_key = _get_signing_key()
    encoded_jwt = jwt.encode(to_encode, signing_key, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    verification_key = _get_verification_key()
    try:
        payload = jwt.decode(token, verification_key, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise ValueError("Invalid token") from e


def load_private_key() -> str:
    with open(settings.JWT_PRIVATE_KEY_PATH) as f:
        return f.read()


def load_public_key() -> str:
    with open(settings.JWT_PUBLIC_KEY_PATH) as f:
        return f.read()


def generate_keys():
    import os

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    os.makedirs(os.path.dirname(settings.JWT_PRIVATE_KEY_PATH), exist_ok=True)

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

    with open(settings.JWT_PRIVATE_KEY_PATH, "wb") as f:
        f.write(private_pem)

    with open(settings.JWT_PUBLIC_KEY_PATH, "wb") as f:
        f.write(public_pem)


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Get the current authenticated user from JWT token."""
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

        user_id_uuid = UUID(user_id)
        result = await session.execute(select(User).where(User.id == user_id_uuid))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        return user
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )