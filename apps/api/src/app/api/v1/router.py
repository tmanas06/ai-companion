from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, conversation, memory, avatar, companion, voice, sadtalker, blockchain

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(companion.router, prefix="/companions", tags=["companions"])
api_router.include_router(conversation.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(memory.router, prefix="/memories", tags=["memories"])
api_router.include_router(avatar.router, prefix="/avatars", tags=["avatars"])
api_router.include_router(voice.router, prefix="/voice", tags=["voice"])
api_router.include_router(sadtalker.router, tags=["sadtalker"])
api_router.include_router(blockchain.router, prefix="/blockchain", tags=["blockchain"])
