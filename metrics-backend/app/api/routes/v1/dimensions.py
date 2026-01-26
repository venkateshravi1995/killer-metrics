"""Dimension catalog endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select

from app.api.routes.v1.utils import set_cache_control
from app.api.schemas.dimensions import DimensionValuesQuery
from app.db.helpers import apply_pagination, resolve_dimension_ids, resolve_metric_id
from app.db.postgres import PostgresExecutor
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
    *,
    is_active: Annotated[bool | None, Query()] = True,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """List available dimensions."""
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
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Fetch a single dimension by key."""
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
    filters: Annotated[DimensionValuesQuery, Depends()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """List dimension values, optionally scoped by metric and time range."""
    set_cache_control(response)
    dimension_ids = await resolve_dimension_ids(connection, [dimension_key])
    dimension_id = dimension_ids[dimension_key]

    stmt = select(DimensionValue.value.label("dimension_value")).distinct()
    stmt = stmt.where(DimensionValue.dimension_id == dimension_id)

    if filters.metric_key or filters.start_time or filters.end_time:
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

    if filters.metric_key:
        metric_id = await resolve_metric_id(connection, filters.metric_key)
        stmt = stmt.where(MetricSeries.metric_id == metric_id)

    if filters.start_time:
        stmt = stmt.where(MetricObservation.time_start_ts >= filters.start_time)
    if filters.end_time:
        stmt = stmt.where(MetricObservation.time_start_ts < filters.end_time)

    stmt = stmt.order_by(DimensionValue.value)
    stmt = apply_pagination(stmt, filters.limit, filters.offset)

    result = await connection.execute(stmt)
    rows = result.scalars().all()
    return {
        "dimension_key": dimension_key,
        "items": rows,
        "limit": filters.limit,
        "offset": filters.offset,
    }
