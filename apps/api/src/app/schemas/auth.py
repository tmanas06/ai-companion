from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    wallet_address: str | None = None


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str | None
    wallet_address: str | None = None
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True
