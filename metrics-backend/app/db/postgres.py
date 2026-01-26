"""Postgres connection helpers for the metrics backend."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING
from urllib.parse import quote_plus

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from sqlalchemy.engine import Result
    from sqlalchemy.sql.elements import ClauseElement

logger = logging.getLogger(__name__)

DB_CONFIG_ERROR = "DATABASE_URL or PG_* env vars are required for Postgres."
DB_QUERY_ERROR = "Database query failed."


@dataclass
class _EngineState:
    engine: AsyncEngine | None = None
    sessionmaker: async_sessionmaker[AsyncSession] | None = None


_STATE = _EngineState()


class DatabaseError(RuntimeError):
    """Raised when database operations fail."""


class DatabaseConfigError(RuntimeError):
    """Raised when database configuration is missing."""


@dataclass(frozen=True)
class PostgresExecutor:
    """Thin wrapper around an async SQLAlchemy session."""

    session: AsyncSession

    async def execute(
        self,
        stmt: ClauseElement,
        params: dict[str, object] | None = None,
    ) -> Result:
        """Execute a SQL statement with optional parameters."""
        try:
            return await self.session.execute(stmt, params or {})
        except SQLAlchemyError as exc:
            logger.exception("Postgres execute failed")
            raise DatabaseError(DB_QUERY_ERROR) from exc


def _normalize_database_url(url: str) -> str:
    """Normalize known Postgres URL prefixes."""
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
    """Build a fully qualified async Postgres URL from settings."""
    if settings.database_url:
        return _normalize_database_url(settings.database_url)
    if settings.pg_host and settings.pg_database and settings.pg_user:
        user = quote_plus(settings.pg_user)
        password = quote_plus(settings.pg_password) if settings.pg_password else ""
        auth = f"{user}:{password}" if password else user
        port = settings.pg_port or "5432"
        return f"postgresql+psycopg://{auth}@{settings.pg_host}:{port}/{settings.pg_database}"
    raise DatabaseConfigError(DB_CONFIG_ERROR)


def build_database_url() -> str:
    """Public wrapper for the configured database URL."""
    return _build_database_url()


def get_engine() -> AsyncEngine:
    """Return the shared async engine."""
    if _STATE.engine is None:
        url = _build_database_url()
        _STATE.engine = create_async_engine(
            url,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_recycle=settings.db_pool_recycle,
        )
    return _STATE.engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Return the shared async sessionmaker."""
    if _STATE.sessionmaker is None:
        _STATE.sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _STATE.sessionmaker


async def dispose_engine() -> None:
    """Dispose of the shared engine and reset state."""
    if _STATE.engine is None:
        return
    await _STATE.engine.dispose()
    _STATE.engine = None
    _STATE.sessionmaker = None


@asynccontextmanager
async def get_executor(
    sessionmaker: async_sessionmaker[AsyncSession] | None = None,
) -> AsyncIterator[PostgresExecutor]:
    """Yield a PostgresExecutor for the request scope."""
    if sessionmaker is None:
        sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield PostgresExecutor(session)
