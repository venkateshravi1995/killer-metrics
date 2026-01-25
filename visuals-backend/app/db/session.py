from collections.abc import AsyncIterator

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import build_database_url

_ENGINE: AsyncEngine | None = None
_SESSIONMAKER: async_sessionmaker[AsyncSession] | None = None


class DatabaseError(RuntimeError):
    pass


class DatabaseConfigError(RuntimeError):
    pass


def _get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _ENGINE, _SESSIONMAKER
    if _SESSIONMAKER is None:
        database_url = build_database_url()
        if not database_url:
            raise DatabaseConfigError("Dashboarding database URL is not configured.")
        _ENGINE = create_async_engine(database_url, pool_pre_ping=True)
        _SESSIONMAKER = async_sessionmaker(_ENGINE, expire_on_commit=False)
    return _SESSIONMAKER


async def get_session() -> AsyncIterator[AsyncSession]:
    sessionmaker = _get_sessionmaker()
    async with sessionmaker() as session:
        try:
            yield session
        except SQLAlchemyError as exc:
            raise DatabaseError("Database operation failed.") from exc


async def close_engine() -> None:
    if _ENGINE is not None:
        await _ENGINE.dispose()
