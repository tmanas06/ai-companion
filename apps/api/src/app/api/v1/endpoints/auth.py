
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
    get_current_user,
)
from app.models.user import User
from app.schemas.auth import (
    GoogleAuthRequest,
    RefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.wallet import create_and_encrypt_wallet

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, session: AsyncSession = Depends(get_db)):
    existing = await session.execute(select(User).where(User.email == user_data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    wallet_address, encrypted_wallet_key = create_and_encrypt_wallet()

    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=get_password_hash(user_data.password),
        wallet_address=wallet_address,
        encrypted_wallet_key=encrypted_wallet_key,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        wallet_address=user.wallet_address,
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        wallet_address=user.wallet_address,
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(payload: GoogleAuthRequest, session: AsyncSession = Depends(get_db)):
    """Authenticate with Google ID Token and automatically create an EVM wallet if needed."""
    credential = payload.credential.strip()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google credential token is required",
        )

    # 1. Verify token with Google's tokeninfo API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Google token",
                )
            token_info = resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication service temporarily unreachable",
        ) from exc

    google_sub = token_info.get("sub")
    email = token_info.get("email")
    full_name = token_info.get("name") or token_info.get("given_name")
    email_verified = token_info.get("email_verified") in (True, "true", "True")

    if not google_sub or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token missing required Google user information",
        )

    # 2. Check audience if GOOGLE_CLIENT_ID is configured
    expected_client_id = settings.GOOGLE_CLIENT_ID
    token_aud = token_info.get("aud")
    if expected_client_id and token_aud != expected_client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token audience mismatch",
        )

    # 3. Find or create user
    result = await session.execute(select(User).where(User.google_id == google_sub))
    user = result.scalar_one_or_none()

    if not user:
        # Check by email
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link existing account to Google
            user.google_id = google_sub
            if email_verified and not user.email_verified:
                user.email_verified = True

    if user:
        # If user existed but did not have a wallet yet, generate one
        if not user.wallet_address:
            wallet_addr, enc_key = create_and_encrypt_wallet()
            user.wallet_address = wallet_addr
            user.encrypted_wallet_key = enc_key
            session.add(user)
            await session.commit()
            await session.refresh(user)
    else:
        # Auto-create new user + Auto-generate EVM wallet
        wallet_addr, enc_key = create_and_encrypt_wallet()
        user = User(
            email=email,
            full_name=full_name,
            email_verified=email_verified,
            google_id=google_sub,
            wallet_address=wallet_addr,
            encrypted_wallet_key=enc_key,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        wallet_address=user.wallet_address,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(refresh_request: RefreshRequest, session: AsyncSession = Depends(get_db)):
    from app.core.security import decode_token

    try:
        payload = decode_token(refresh_request.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Invalid token type")
        user_id = payload.get("sub")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    new_access_token = create_access_token({"sub": str(user.id), "email": user.email})
    new_refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return profile for currently authenticated user."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        wallet_address=current_user.wallet_address,
        is_active=current_user.is_active,
        created_at=current_user.created_at.isoformat() if current_user.created_at else "",
    )
