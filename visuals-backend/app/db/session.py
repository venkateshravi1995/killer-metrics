"""Database session helpers for the visuals backend."""

from collections.abc import AsyncIterator
from dataclasses import dataclass

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import build_database_url

DB_CONFIG_ERROR = "Dashboarding database URL is not configured."
DB_QUERY_ERROR = "Database operation failed."


@dataclass
class _EngineState:
    engine: AsyncEngine | None = None
    sessionmaker: async_sessionmaker[AsyncSession] | None = None


_STATE = _EngineState()


class DatabaseError(RuntimeError):
    """Raised when database operations fail."""


class DatabaseConfigError(RuntimeError):
    """Raised when database configuration is missing."""


def _get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Create or return the shared async sessionmaker."""
    if _STATE.sessionmaker is None:
        database_url = build_database_url()
        if not database_url:
            raise DatabaseConfigError(DB_CONFIG_ERROR)
        _STATE.engine = create_async_engine(database_url, pool_pre_ping=True)
        _STATE.sessionmaker = async_sessionmaker(_STATE.engine, expire_on_commit=False)
    return _STATE.sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an async session for request-scoped use."""
    sessionmaker = _get_sessionmaker()
    async with sessionmaker() as session:
        try:
            yield session
        except SQLAlchemyError as exc:
            raise DatabaseError(DB_QUERY_ERROR) from exc


async def close_engine() -> None:
    """Dispose of the shared async engine."""
    if _STATE.engine is not None:
        await _STATE.engine.dispose()
        _STATE.engine = None
        _STATE.sessionmaker = None
