"""PartsDonor — SQLAlchemy engine/session (своя БД торгового домена)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, future=True)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    """FastAPI dependency: даёт сессию БД."""
    async with async_session_factory() as session:
        yield session


__all__ = ["engine", "async_session_factory", "get_db"]
