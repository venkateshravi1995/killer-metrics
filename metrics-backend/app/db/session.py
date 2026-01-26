"""FastAPI session dependency helpers."""

from collections.abc import AsyncIterator

from fastapi import Request

from app.db.postgres import PostgresExecutor, get_executor, get_sessionmaker


async def get_connection(request: Request) -> AsyncIterator[PostgresExecutor]:
    """Provide a Postgres executor scoped to the request."""
    sessionmaker = getattr(request.app.state, "db_sessionmaker", None) or get_sessionmaker()
    async with get_executor(sessionmaker) as executor:
        yield executor
