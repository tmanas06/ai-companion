from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# Sync engine for migrations and sync operations
sync_engine = create_engine(
    str(settings.DATABASE_URL).replace("postgresql+asyncpg", "postgresql+psycopg2").replace("postgresql://", "postgresql+psycopg2://"),
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_timeout=settings.DATABASE_POOL_TIMEOUT,
    pool_pre_ping=True,
    echo=settings.ENVIRONMENT == "development",
)

# Async engine for application use
async_engine_kwargs = {
    "pool_pre_ping": True,
    "echo": settings.ENVIRONMENT == "development",
}

if settings.ENVIRONMENT == "test":
    async_engine_kwargs["poolclass"] = NullPool
else:
    async_engine_kwargs.update({
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
        "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
    })

async_db_url = (
    str(settings.DATABASE_URL)
    .replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    .replace("postgresql://", "postgresql+asyncpg://")
)

async_engine = create_async_engine(
    async_db_url,
    **async_engine_kwargs,
)

async_session_maker = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


def create_db_and_tables():
    SQLModel.metadata.create_all(sync_engine)


async def create_db_and_tables_async():
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


def get_session() -> Session:
    with Session(sync_engine) as session:
        yield session


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_async_session() as session:
        yield session
