"""Metric catalog endpoints."""

from collections.abc import Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy import func, literal, literal_column, or_, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from app.api.routes.v1.utils import (
    apply_dimension_pairs,
    parse_dimension_pairs,
    set_cache_control,
)
from app.api.schemas.metrics import MetricListQuery, MetricSearchFilters, MetricSearchRequest
from app.db.helpers import (
    apply_pagination,
    is_supported_grain,
    normalize_grain,
    resolve_metric_id,
    resolve_metric_source_grains,
)
from app.db.postgres import PostgresExecutor
from app.db.schema import MetricDefinition, MetricObservation, MetricSeries
from app.db.session import get_connection

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])

DEFAULT_SEARCH_FIELDS = ("metric_name", "metric_description", "metric_type")
SEARCH_FIELD_WEIGHTS = {
    "metric_name": "A",
    "metric_type": "B",
    "metric_description": "C",
}


def _apply_metric_filters(stmt: Select, filters: MetricSearchFilters) -> Select:
    """Apply metric filters to a statement."""
    if filters.metric_id:
        stmt = stmt.where(MetricDefinition.metric_id.in_(filters.metric_id))
    if filters.metric_key:
        stmt = stmt.where(MetricDefinition.metric_key.in_(filters.metric_key))
    if filters.metric_name:
        stmt = stmt.where(MetricDefinition.metric_name.in_(filters.metric_name))
    if filters.metric_type:
        stmt = stmt.where(MetricDefinition.metric_type.in_(filters.metric_type))
    if filters.unit:
        stmt = stmt.where(MetricDefinition.unit.in_(filters.unit))
    if filters.directionality:
        stmt = stmt.where(MetricDefinition.directionality.in_(filters.directionality))
    if filters.aggregation:
        stmt = stmt.where(MetricDefinition.aggregation.in_(filters.aggregation))
    if filters.is_active:
        stmt = stmt.where(MetricDefinition.is_active.in_(filters.is_active))
    return stmt


def _build_search_parts(
    search_fields: Sequence[str],
    unaccent_query: ColumnElement[Any],
) -> tuple[list[ColumnElement[Any]], list[ColumnElement[Any]]]:
    """Build tsvector and similarity expressions for search fields."""
    tsv_parts: list[ColumnElement[Any]] = []
    sim_parts: list[ColumnElement[Any]] = []
    for field in search_fields:
        column = getattr(MetricDefinition, field)
        weight = SEARCH_FIELD_WEIGHTS[field]
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


def _apply_search_query(
    stmt: Select,
    query: str,
    search_fields: Sequence[str],
    similarity: float | None,
) -> Select:
    """Apply full-text and trigram search constraints."""
    query = query.strip()
    if not query:
        return stmt.order_by(MetricDefinition.metric_key)

    similarity_threshold = similarity if similarity is not None else 0.25
    fields = [field for field in search_fields if field in SEARCH_FIELD_WEIGHTS]
    if not fields:
        fields = list(DEFAULT_SEARCH_FIELDS)

    query_literal = literal(query)
    unaccent_query = func.metrics.immutable_unaccent(query_literal)
    tsv_parts, sim_parts = _build_search_parts(fields, unaccent_query)
    tsv = _combine_tsv_parts(tsv_parts)
    tsquery = func.websearch_to_tsquery("simple", unaccent_query)

    best_sim = func.greatest(*sim_parts)
    rank = func.ts_rank_cd(tsv, tsquery)
    score = (rank * 2.0) + (best_sim * 1.5)

    stmt = stmt.where(or_(tsv.op("@@")(tsquery), best_sim >= similarity_threshold))
    return stmt.order_by(score.desc(), MetricDefinition.metric_key)


def _split_csv(values: list[str] | None) -> list[str]:
    if not values:
        return []
    items: list[str] = []
    for raw in values:
        for part in raw.split("|"):
            cleaned = part.strip()
            if cleaned:
                items.append(cleaned)
    return list(dict.fromkeys(items))


def _split_csv_int(values: list[str] | None) -> list[int]:
    items = _split_csv(values)
    if not items:
        return []
    parsed: list[int] = []
    for value in items:
        try:
            parsed.append(int(value))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid metric_id: {value}") from exc
    return parsed


@router.get("")
async def list_metrics(
    response: Response,
    filters: Annotated[MetricListQuery, Depends()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """List metric definitions with optional filters."""
    set_cache_control(response)
    stmt = select(MetricDefinition).order_by(MetricDefinition.metric_key)
    metric_ids = _split_csv_int(filters.metric_id)
    if metric_ids:
        stmt = stmt.where(MetricDefinition.metric_id.in_(metric_ids))
    metric_keys = _split_csv(filters.metric_key)
    if metric_keys:
        stmt = stmt.where(MetricDefinition.metric_key.in_(metric_keys))
    metric_names = _split_csv(filters.metric_name)
    if metric_names:
        stmt = stmt.where(MetricDefinition.metric_name.in_(metric_names))
    metric_types = _split_csv(filters.metric_type)
    if metric_types:
        stmt = stmt.where(MetricDefinition.metric_type.in_(metric_types))
    units = _split_csv(filters.unit)
    if units:
        stmt = stmt.where(MetricDefinition.unit.in_(units))
    directions = _split_csv(filters.directionality)
    if directions:
        stmt = stmt.where(MetricDefinition.directionality.in_(directions))
    aggregations = _split_csv(filters.aggregation)
    if aggregations:
        stmt = stmt.where(MetricDefinition.aggregation.in_(aggregations))
    if filters.is_active is not None:
        stmt = stmt.where(MetricDefinition.is_active == filters.is_active)
    stmt = apply_pagination(stmt, filters.limit, filters.offset)
    result = await connection.execute(stmt)
    rows = result.scalars().all()
    return {
        "items": [row.to_dict() for row in rows],
        "limit": filters.limit,
        "offset": filters.offset,
    }


@router.get("/{metric_key}")
async def get_metric(
    metric_key: str,
    response: Response,
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Fetch a single metric definition by key."""
    set_cache_control(response)
    stmt = select(MetricDefinition).where(MetricDefinition.metric_key == metric_key)
    result = await connection.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="metric_key not found")
    return row.to_dict()


@router.post("/search")
async def search_metrics(
    response: Response,
    payload: Annotated[MetricSearchRequest, Body()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Search metric definitions with full-text and trigram matching."""
    set_cache_control(response)
    stmt = select(MetricDefinition)

    stmt = _apply_metric_filters(stmt, payload.filters)
    stmt = _apply_search_query(
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


@router.get("/{metric_key}/availability")
async def get_metric_availability(
    metric_key: str,
    response: Response,
    grain: Annotated[str, Query()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
    dimensions: Annotated[list[str] | None, Query()] = None,
) -> dict:
    """Return the available time window for a metric."""
    set_cache_control(response)
    requested_grain = normalize_grain(grain)
    if not is_supported_grain(requested_grain):
        raise HTTPException(status_code=400, detail="unsupported grain")
    metric_id = await resolve_metric_id(connection, metric_key)
    source_grains = await resolve_metric_source_grains(
        connection,
        [metric_id],
        requested_grain,
    )
    source_grain = source_grains.get(metric_id, requested_grain)
    filters = parse_dimension_pairs(dimensions)

    time_bucket = func.date_trunc(requested_grain, MetricObservation.time_start_ts)
    stmt = (
        select(
            func.min(time_bucket).label("min_time_start_ts"),
            func.max(time_bucket).label("max_time_start_ts"),
        )
        .join(
            MetricSeries,
            MetricSeries.series_id == MetricObservation.series_id,
        )
        .where(
            MetricSeries.metric_id == metric_id,
            MetricSeries.grain == source_grain,
        )
    )

    stmt = await apply_dimension_pairs(stmt, connection, filters, "availability")

    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": requested_grain,
        "min_time_start_ts": row["min_time_start_ts"] if row else None,
        "max_time_start_ts": row["max_time_start_ts"] if row else None,
    }


@router.get("/{metric_key}/freshness")
async def get_metric_freshness(
    metric_key: str,
    grain: Annotated[str, Query()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
    dimensions: Annotated[list[str] | None, Query()] = None,
) -> dict:
    """Return the latest observation timestamp for a metric."""
    requested_grain = normalize_grain(grain)
    if not is_supported_grain(requested_grain):
        raise HTTPException(status_code=400, detail="unsupported grain")
    metric_id = await resolve_metric_id(connection, metric_key)
    source_grains = await resolve_metric_source_grains(
        connection,
        [metric_id],
        requested_grain,
    )
    source_grain = source_grains.get(metric_id, requested_grain)
    filters = parse_dimension_pairs(dimensions)

    stmt = (
        select(
            MetricObservation.time_start_ts.label("latest_time_start_ts"),
            MetricObservation.ingested_ts.label("latest_ingested_ts"),
        )
        .join(
            MetricSeries,
            MetricSeries.series_id == MetricObservation.series_id,
        )
        .where(
            MetricSeries.metric_id == metric_id,
            MetricSeries.grain == source_grain,
        )
    )

    stmt = await apply_dimension_pairs(stmt, connection, filters, "freshness")

    stmt = stmt.order_by(MetricObservation.time_start_ts.desc()).limit(1)
    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": requested_grain,
        "latest_time_start_ts": row["latest_time_start_ts"] if row else None,
        "latest_ingested_ts": row["latest_ingested_ts"] if row else None,
    }
