
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
from jose import jwt
from app.models.user import User
from app.schemas.auth import (
    GoogleAuthRequest,
    PrivyAuthRequest,
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


@router.post("/privy", response_model=TokenResponse)
async def privy_login(payload: PrivyAuthRequest, session: AsyncSession = Depends(get_db)):
    """Authenticate with Privy and automatically provision or link an EVM wallet."""
    token = (payload.token or "").strip()
    privy_sub = (payload.privy_user_id or "").strip() or None
    email = payload.email
    full_name = payload.full_name
    wallet_address = payload.wallet_address

    if not token and not privy_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Privy authentication token or user ID is required",
        )

    # 1. Decode token claims if token provided
    if token:
        try:
            unverified_claims = jwt.get_unverified_claims(token)
            if not privy_sub:
                privy_sub = unverified_claims.get("sub")
            if not email and unverified_claims.get("email"):
                email = unverified_claims.get("email")

            # Validate audience if PRIVY_APP_ID is configured
            expected_app_id = settings.PRIVY_APP_ID
            aud = unverified_claims.get("aud")
            if expected_app_id and aud and aud != expected_app_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Privy token audience mismatch",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    if not privy_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token missing required Privy user information",
        )

    # 2. Derive email if absent (e.g. wallet-only sign-in)
    if not email:
        clean_id = privy_sub.replace("did:privy:", "").replace(":", "_")
        email = f"{clean_id}@privy.user"

    # 3. Find or create user
    result = await session.execute(select(User).where(User.privy_id == privy_sub))
    user = result.scalar_one_or_none()

    if not user:
        # Check by email
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link existing account to Privy
            user.privy_id = privy_sub

    if user:
        # If user existed but did not have a wallet yet, link privy wallet or generate one
        if not user.wallet_address:
            if wallet_address:
                user.wallet_address = wallet_address
            else:
                wallet_addr, enc_key = create_and_encrypt_wallet()
                user.wallet_address = wallet_addr
                user.encrypted_wallet_key = enc_key
            session.add(user)
            await session.commit()
            await session.refresh(user)
    else:
        # Auto-create new user + wallet
        if wallet_address:
            wallet_addr = wallet_address
            enc_key = None
        else:
            wallet_addr, enc_key = create_and_encrypt_wallet()

        user = User(
            email=email,
            full_name=full_name or "Privy User",
            email_verified=True,
            privy_id=privy_sub,
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
