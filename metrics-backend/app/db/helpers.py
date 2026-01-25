from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.sql.selectable import Select

from app.db.postgres import PostgresExecutor
from app.db.schema import DimensionDefinition, MetricDefinition


async def resolve_metric_id(connection: PostgresExecutor, metric_key: str) -> int:
    stmt = select(MetricDefinition.metric_id).where(MetricDefinition.metric_key == metric_key)
    result = await connection.execute(stmt)
    metric_id = result.scalar_one_or_none()
    if metric_id is None:
        raise HTTPException(status_code=404, detail="metric_key not found")
    return int(metric_id)


async def resolve_metric_ids(
    connection: PostgresExecutor, metric_keys: Iterable[str]
) -> dict[str, dict[str, int | str]]:
    keys = list(dict.fromkeys(metric_keys))
    if not keys:
        raise HTTPException(status_code=400, detail="metric_keys required")
    stmt = select(
        MetricDefinition.metric_key,
        MetricDefinition.metric_id,
        MetricDefinition.aggregation,
    ).where(MetricDefinition.metric_key.in_(keys))
    result = await connection.execute(stmt)
    rows = result.mappings().all()
    found = {
        row["metric_key"]: {
            "metric_id": int(row["metric_id"]),
            "aggregation": row["aggregation"],
        }
        for row in rows
    }
    missing = [key for key in keys if key not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"metric_key not found: {', '.join(missing)}")
    return found


async def resolve_dimension_ids(
    connection: PostgresExecutor, dimension_keys: Iterable[str]
) -> dict[str, int]:
    keys = list(dict.fromkeys(dimension_keys))
    if not keys:
        return {}
    stmt = select(
        DimensionDefinition.dimension_key,
        DimensionDefinition.dimension_id,
    ).where(DimensionDefinition.dimension_key.in_(keys))
    result = await connection.execute(stmt)
    rows = result.mappings().all()
    found = {row["dimension_key"]: int(row["dimension_id"]) for row in rows}
    missing = [key for key in keys if key not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"dimension_key not found: {', '.join(missing)}")
    return found


def apply_pagination(stmt: Select, limit: int | None, offset: int | None) -> Select:
    if limit is not None:
        stmt = stmt.limit(limit)
    if offset is not None:
        stmt = stmt.offset(offset)
    return stmt
