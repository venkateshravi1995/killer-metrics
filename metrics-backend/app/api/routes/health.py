"""Health check endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.db.postgres import PostgresExecutor
from app.db.schema import MetricDefinition
from app.db.session import get_connection

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Return a basic service status."""
    return {"status": "ok"}


@router.get("/health/db")
async def health_db_check(
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Return a database connectivity status."""
    stmt = select(func.count(MetricDefinition.metric_id).label("ok"))
    result = await connection.execute(stmt)
    ok = result.scalar_one_or_none()
    return {"status": "ok", "db": ok}
