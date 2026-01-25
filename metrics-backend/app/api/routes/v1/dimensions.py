from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from app.api.routes.v1.utils import set_cache_control

from app.db.postgres import PostgresExecutor
from app.db.helpers import apply_pagination, resolve_dimension_ids, resolve_metric_id
from app.db.schema import (
    DimensionDefinition,
    DimensionSetValue,
    DimensionValue,
    MetricObservation,
    MetricSeries,
)
from app.db.session import get_connection

router = APIRouter(prefix="/v1/dimensions", tags=["dimensions"])


@router.get("")
async def list_dimensions(
    response: Response,
    is_active: bool | None = Query(True),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    set_cache_control(response)
    stmt = select(DimensionDefinition).order_by(DimensionDefinition.dimension_key)
    if is_active is not None:
        stmt = stmt.where(DimensionDefinition.is_active == is_active)
    stmt = apply_pagination(stmt, limit, offset)
    result = await connection.execute(stmt)
    rows = result.scalars().all()
    return {"items": [row.to_dict() for row in rows], "limit": limit, "offset": offset}


@router.get("/{dimension_key}")
async def get_dimension(
    dimension_key: str,
    response: Response,
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    set_cache_control(response)
    stmt = select(DimensionDefinition).where(DimensionDefinition.dimension_key == dimension_key)
    result = await connection.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="dimension_key not found")
    return row.to_dict()


@router.get("/{dimension_key}/values")
async def get_dimension_values(
    dimension_key: str,
    response: Response,
    metric_key: str | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    set_cache_control(response)
    dimension_ids = await resolve_dimension_ids(connection, [dimension_key])
    dimension_id = dimension_ids[dimension_key]

    stmt = select(DimensionValue.value.label("dimension_value")).distinct()
    stmt = stmt.where(DimensionValue.dimension_id == dimension_id)

    if metric_key or start_time or end_time:
        stmt = stmt.join(
            DimensionSetValue,
            DimensionSetValue.value_id == DimensionValue.value_id,
        ).join(
            MetricSeries,
            MetricSeries.set_id == DimensionSetValue.set_id,
        ).join(
            MetricObservation,
            MetricObservation.series_id == MetricSeries.series_id,
        )

    if metric_key:
        metric_id = await resolve_metric_id(connection, metric_key)
        stmt = stmt.where(MetricSeries.metric_id == metric_id)

    if start_time:
        stmt = stmt.where(MetricObservation.time_start_ts >= start_time)
    if end_time:
        stmt = stmt.where(MetricObservation.time_start_ts < end_time)

    stmt = stmt.order_by(DimensionValue.value)
    stmt = apply_pagination(stmt, limit, offset)

    result = await connection.execute(stmt)
    rows = result.scalars().all()
    return {
        "dimension_key": dimension_key,
        "items": rows,
        "limit": limit,
        "offset": offset,
    }
