from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator
from urllib.parse import quote_plus

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.sql.elements import ClauseElement

from app.core.config import settings

logger = logging.getLogger(__name__)

_ENGINE: AsyncEngine | None = None
_SESSIONMAKER: async_sessionmaker[AsyncSession] | None = None


class DatabaseError(RuntimeError):
    pass


class DatabaseConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class PostgresExecutor:
    session: AsyncSession

    async def execute(self, stmt: ClauseElement, params: dict[str, object] | None = None):
        try:
            return await self.session.execute(stmt, params or {})
        except SQLAlchemyError as exc:
            logger.exception("Postgres execute failed")
            raise DatabaseError("Database query failed.") from exc


def _normalize_database_url(url: str) -> str:
    trimmed = url.strip()
    if not trimmed:
        return ""
    if trimmed.startswith("postgresql+psycopg://"):
        return trimmed
    if trimmed.startswith("postgresql+psycopg2://"):
        return trimmed.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    if trimmed.startswith("postgresql://"):
        return trimmed.replace("postgresql://", "postgresql+psycopg://", 1)
    if trimmed.startswith("postgres://"):
        return trimmed.replace("postgres://", "postgresql+psycopg://", 1)
    return trimmed


def _build_database_url() -> str:
    if settings.database_url:
        return _normalize_database_url(settings.database_url)
    if settings.pg_host and settings.pg_database and settings.pg_user:
        user = quote_plus(settings.pg_user)
        password = quote_plus(settings.pg_password) if settings.pg_password else ""
        auth = f"{user}:{password}" if password else user
        port = settings.pg_port or "5432"
        return f"postgresql+psycopg://{auth}@{settings.pg_host}:{port}/{settings.pg_database}"
    raise DatabaseConfigError("DATABASE_URL or PG_* env vars are required for Postgres.")


def get_engine() -> AsyncEngine:
    global _ENGINE
    if _ENGINE is None:
        url = _build_database_url()
        _ENGINE = create_async_engine(
            url,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_recycle=settings.db_pool_recycle,
        )
    return _ENGINE


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _SESSIONMAKER
    if _SESSIONMAKER is None:
        _SESSIONMAKER = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _SESSIONMAKER


async def dispose_engine() -> None:
    global _ENGINE
    global _SESSIONMAKER
    if _ENGINE is None:
        return
    await _ENGINE.dispose()
    _ENGINE = None
    _SESSIONMAKER = None


@asynccontextmanager
async def get_executor(
    sessionmaker: async_sessionmaker[AsyncSession] | None = None,
) -> AsyncIterator[PostgresExecutor]:
    if sessionmaker is None:
        sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield PostgresExecutor(session)
