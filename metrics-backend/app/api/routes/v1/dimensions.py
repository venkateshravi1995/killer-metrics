"""Dimension catalog endpoints."""

from collections.abc import Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy import func, literal, literal_column, or_, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from app.api.routes.v1.utils import set_cache_control
from app.api.schemas.dimensions import (
    DimensionSearchFilters,
    DimensionSearchRequest,
    DimensionValueSearchRequest,
    DimensionValuesQuery,
)
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

DEFAULT_DIMENSION_SEARCH_FIELDS = ("dimension_name", "dimension_description")
DIMENSION_SEARCH_FIELD_WEIGHTS = {
    "dimension_name": "A",
    "dimension_key": "B",
    "dimension_description": "C",
}


def _apply_dimension_filters(stmt: Select, filters: DimensionSearchFilters) -> Select:
    """Apply dimension filters to a statement."""
    if filters.dimension_id:
        stmt = stmt.where(DimensionDefinition.dimension_id.in_(filters.dimension_id))
    if filters.dimension_key:
        stmt = stmt.where(DimensionDefinition.dimension_key.in_(filters.dimension_key))
    if filters.dimension_name:
        stmt = stmt.where(DimensionDefinition.dimension_name.in_(filters.dimension_name))
    if filters.value_type:
        stmt = stmt.where(DimensionDefinition.value_type.in_(filters.value_type))
    if filters.is_active:
        stmt = stmt.where(DimensionDefinition.is_active.in_(filters.is_active))
    return stmt


def _build_dimension_search_parts(
    search_fields: Sequence[str],
    unaccent_query: ColumnElement[Any],
) -> tuple[list[ColumnElement[Any]], list[ColumnElement[Any]]]:
    """Build tsvector and similarity expressions for dimension search."""
    tsv_parts: list[ColumnElement[Any]] = []
    sim_parts: list[ColumnElement[Any]] = []
    for field in search_fields:
        column = getattr(DimensionDefinition, field)
        weight = DIMENSION_SEARCH_FIELD_WEIGHTS[field]
        weight_literal = literal_column(f"'{weight}'::\"char\"")
        tsv_parts.append(
            func.setweight(
                func.to_tsvector(
                    "simple",
                    func.metrics.immutable_unaccent(func.coalesce(column, "")),
                ),
                weight_literal,
            ),
        )
        sim_parts.append(
            func.metrics.similarity(
                func.lower(func.metrics.immutable_unaccent(column)),
                func.lower(unaccent_query),
            ),
        )
    return tsv_parts, sim_parts


def _combine_tsv_parts(tsv_parts: Sequence[ColumnElement[Any]]) -> ColumnElement[Any]:
    """Combine weighted tsvector parts into a single expression."""
    tsv = tsv_parts[0]
    for part in tsv_parts[1:]:
        tsv = tsv.op("||")(part)
    return tsv


def _apply_dimension_search_query(
    stmt: Select,
    query: str,
    search_fields: Sequence[str],
    similarity: float | None,
) -> Select:
    """Apply full-text and trigram search constraints to dimensions."""
    query = query.strip()
    if not query:
        return stmt.order_by(DimensionDefinition.dimension_key)

    similarity_threshold = similarity if similarity is not None else 0.25
    fields = [field for field in search_fields if field in DIMENSION_SEARCH_FIELD_WEIGHTS]
    if not fields:
        fields = list(DEFAULT_DIMENSION_SEARCH_FIELDS)

    query_literal = literal(query)
    unaccent_query = func.metrics.immutable_unaccent(query_literal)
    tsv_parts, sim_parts = _build_dimension_search_parts(fields, unaccent_query)
    tsv = _combine_tsv_parts(tsv_parts)
    tsquery = func.websearch_to_tsquery("simple", unaccent_query)

    best_sim = func.greatest(*sim_parts)
    rank = func.ts_rank_cd(tsv, tsquery)
    score = (rank * 2.0) + (best_sim * 1.5)

    stmt = stmt.where(or_(tsv.op("@@")(tsquery), best_sim >= similarity_threshold))
    return stmt.order_by(score.desc(), DimensionDefinition.dimension_key)


def _apply_dimension_value_search_query(
    stmt: Select,
    query: str,
    similarity: float | None,
) -> tuple[Select, ColumnElement[Any] | None]:
    """Apply full-text and trigram search constraints to dimension values."""
    query = query.strip()
    if not query:
        return stmt.order_by(DimensionValue.value), None

    similarity_threshold = similarity if similarity is not None else 0.25
    query_literal = literal(query)
    unaccent_query = func.metrics.immutable_unaccent(query_literal)
    value_expr = func.metrics.immutable_unaccent(func.coalesce(DimensionValue.value, ""))
    tsv = func.to_tsvector("simple", value_expr)
    tsquery = func.websearch_to_tsquery("simple", unaccent_query)
    sim = func.metrics.similarity(
        func.lower(value_expr),
        func.lower(unaccent_query),
    )
    score = (func.ts_rank_cd(tsv, tsquery) * 2.0) + (sim * 1.5)

    stmt = stmt.where(or_(tsv.op("@@")(tsquery), sim >= similarity_threshold))
    return stmt.order_by(score.desc(), DimensionValue.value), score


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
        stmt = (
            stmt.join(
                DimensionSetValue,
                DimensionSetValue.value_id == DimensionValue.value_id,
            )
            .join(
                MetricSeries,
                MetricSeries.set_id == DimensionSetValue.set_id,
            )
            .join(
                MetricObservation,
                MetricObservation.series_id == MetricSeries.series_id,
            )
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


@router.post("/search")
async def search_dimensions(
    response: Response,
    payload: Annotated[DimensionSearchRequest, Body()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Search dimension definitions with full-text and trigram matching."""
    set_cache_control(response)
    stmt = select(DimensionDefinition)
    stmt = _apply_dimension_filters(stmt, payload.filters)
    stmt = _apply_dimension_search_query(
        stmt,
        payload.q or "",
        payload.search_fields,
        payload.similarity,
    )
    stmt = apply_pagination(stmt, payload.limit, payload.offset)
    result = await connection.execute(stmt)
    rows = result.scalars().all()
    return {
        "items": [row.to_dict() for row in rows],
        "limit": payload.limit,
        "offset": payload.offset,
    }


@router.post("/values/search")
async def search_dimension_values(
    response: Response,
    payload: Annotated[DimensionValueSearchRequest, Body()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Search dimension values with optional metric/time scoping."""
    set_cache_control(response)
    stmt = select(
        DimensionValue.value_id,
        DimensionValue.value,
        DimensionDefinition.dimension_key,
    ).join(
        DimensionDefinition,
        DimensionDefinition.dimension_id == DimensionValue.dimension_id,
    )

    if payload.filters.dimension_key:
        dimension_ids = await resolve_dimension_ids(connection, payload.filters.dimension_key)
        stmt = stmt.where(DimensionValue.dimension_id.in_(dimension_ids.values()))

    if payload.filters.metric_key or payload.filters.start_time or payload.filters.end_time:
        stmt = (
            stmt.join(
                DimensionSetValue,
                DimensionSetValue.value_id == DimensionValue.value_id,
            )
            .join(
                MetricSeries,
                MetricSeries.set_id == DimensionSetValue.set_id,
            )
            .join(
                MetricObservation,
                MetricObservation.series_id == MetricSeries.series_id,
            )
        )

    if payload.filters.metric_key:
        metric_id = await resolve_metric_id(connection, payload.filters.metric_key)
        stmt = stmt.where(MetricSeries.metric_id == metric_id)

    if payload.filters.start_time:
        stmt = stmt.where(MetricObservation.time_start_ts >= payload.filters.start_time)
    if payload.filters.end_time:
        stmt = stmt.where(MetricObservation.time_start_ts < payload.filters.end_time)

    stmt = stmt.distinct()
    stmt, score = _apply_dimension_value_search_query(
        stmt,
        payload.q or "",
        payload.similarity,
    )
    if score is not None:
        stmt = stmt.add_columns(score.label("search_score"))
    stmt = apply_pagination(stmt, payload.limit, payload.offset)

    result = await connection.execute(stmt)
    rows = result.mappings().all()
    return {
        "items": [
            {
                "dimension_key": row["dimension_key"],
                "value_id": int(row["value_id"]),
                "value": row["value"],
            }
            for row in rows
        ],
        "limit": payload.limit,
        "offset": payload.offset,
    }
