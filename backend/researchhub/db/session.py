"""Database session management."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from researchhub.config import get_settings

settings = get_settings()

# Create async engine
engine = create_async_engine(
    str(settings.database_url),
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_timeout=settings.database_pool_timeout,
    pool_pre_ping=True,
    echo=settings.debug,
)

# Create session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Initialize database connection pool."""
    # The engine is created on module import, but we can verify connectivity here
    async with engine.begin() as conn:
        # Simple connectivity check
        await conn.execute(text("SELECT 1"))


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session for dependency injection."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Type alias for dependency injection
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


# Alias for backward compatibility
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Alias for get_db_session."""
    async for session in get_db_session():
        yield session
