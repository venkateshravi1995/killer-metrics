from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.db.postgres import PostgresExecutor
from app.db.schema import MetricDefinition
from app.db.session import get_connection

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db_check(
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    stmt = select(func.count(MetricDefinition.metric_id).label("ok"))
    result = await connection.execute(stmt)
    ok = result.scalar_one_or_none()
    return {"status": "ok", "db": ok}
