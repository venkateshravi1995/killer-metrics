from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select

from app.api.routes.v1.utils import (
    apply_dimension_pairs,
    parse_dimension_pairs,
    set_cache_control,
)
from app.db.postgres import PostgresExecutor
from app.db.helpers import apply_pagination, resolve_metric_id
from app.db.schema import MetricDefinition, MetricObservation
from app.db.session import get_connection

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])


@router.get("")
async def list_metrics(
    response: Response,
    is_active: bool | None = Query(True),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    set_cache_control(response)
    stmt = select(MetricDefinition).order_by(MetricDefinition.metric_key)
    if is_active is not None:
        stmt = stmt.where(MetricDefinition.is_active == is_active)
    stmt = apply_pagination(stmt, limit, offset)
    result = await connection.execute(stmt)
    rows = result.scalars().all()
    return {
        "items": [row.to_dict() for row in rows],
        "limit": limit,
        "offset": offset,
    }


@router.get("/{metric_key}")
async def get_metric(
    metric_key: str,
    response: Response,
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    set_cache_control(response)
    stmt = select(MetricDefinition).where(MetricDefinition.metric_key == metric_key)
    result = await connection.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="metric_key not found")
    return row.to_dict()


@router.get("/{metric_key}/availability")
async def get_metric_availability(
    metric_key: str,
    response: Response,
    grain: str = Query(...),
    dimensions: list[str] | None = Query(None),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    set_cache_control(response)
    metric_id = await resolve_metric_id(connection, metric_key)
    filters = parse_dimension_pairs(dimensions)

    stmt = select(
        func.min(MetricObservation.time_start_ts).label("min_time_start_ts"),
        func.max(MetricObservation.time_start_ts).label("max_time_start_ts"),
    ).where(
        MetricObservation.metric_id == metric_id,
        MetricObservation.grain == grain,
    )

    stmt = await apply_dimension_pairs(stmt, connection, filters, "availability")

    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": grain,
        "min_time_start_ts": row["min_time_start_ts"] if row else None,
        "max_time_start_ts": row["max_time_start_ts"] if row else None,
    }


@router.get("/{metric_key}/freshness")
async def get_metric_freshness(
    metric_key: str,
    grain: str = Query(...),
    dimensions: list[str] | None = Query(None),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    metric_id = await resolve_metric_id(connection, metric_key)
    filters = parse_dimension_pairs(dimensions)

    stmt = select(
        MetricObservation.time_start_ts.label("latest_time_start_ts"),
        MetricObservation.ingested_ts.label("latest_ingested_ts"),
    ).where(
        MetricObservation.metric_id == metric_id,
        MetricObservation.grain == grain,
    )

    stmt = await apply_dimension_pairs(stmt, connection, filters, "freshness")

    stmt = stmt.order_by(MetricObservation.time_start_ts.desc()).limit(1)
    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": grain,
        "latest_time_start_ts": row["latest_time_start_ts"] if row else None,
        "latest_ingested_ts": row["latest_ingested_ts"] if row else None,
    }
