"""Query endpoints for metric observations."""

from collections import defaultdict
from collections.abc import Mapping
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.sql.elements import ColumnElement

from app.api.routes.v1.utils import apply_dimension_pairs, apply_group_by, parse_dimension_pairs
from app.api.schemas.queries import AggregateQuery, TimeseriesQuery, TopKQuery
from app.db.helpers import (
    build_time_bucket,
    is_supported_grain,
    normalize_grain,
    resolve_dimension_ids,
    resolve_metric_id,
    resolve_metric_ids,
    resolve_metric_source_grains,
)
from app.db.postgres import PostgresExecutor
from app.db.schema import MetricDefinition, MetricObservation, MetricSeries
from app.db.session import get_connection

router = APIRouter(prefix="/v1/query", tags=["queries"])


def _aggregation_expression(aggregation: str) -> ColumnElement[Any]:
    """Return the SQL expression for the requested aggregation."""
    normalized = aggregation.lower()
    if normalized == "avg":
        return func.avg(MetricObservation.value_num)
    if normalized == "min":
        return func.min(MetricObservation.value_num)
    if normalized == "max":
        return func.max(MetricObservation.value_num)
    return func.sum(MetricObservation.value_num)


def _build_aggregation_groups(
    metric_meta: dict[str, dict[str, int | str]],
) -> dict[str, list[int]]:
    """Group metric IDs by their aggregation type."""
    aggregation_groups: dict[str, list[int]] = defaultdict(list)
    for meta in metric_meta.values():
        aggregation = str(meta["aggregation"]).lower() if meta["aggregation"] else "sum"
        aggregation_groups[aggregation].append(int(meta["metric_id"]))
    return aggregation_groups


async def _resolve_dimension_context(
    connection: PostgresExecutor,
    group_by: list[str],
) -> tuple[list[str], dict[str, int]]:
    """Resolve dimension IDs needed for group-bys."""
    group_by_labels = list(dict.fromkeys(group_by))
    dimension_keys = list(dict.fromkeys(group_by_labels))
    if not dimension_keys:
        return group_by_labels, {}
    dimension_ids = await resolve_dimension_ids(connection, dimension_keys)
    return group_by_labels, dimension_ids


def _group_metric_ids_by_grain(
    metric_ids: list[int],
    source_grains: dict[int, str],
) -> dict[str, list[int]]:
    """Group metric IDs by the available source grain."""
    metric_ids_by_grain: dict[str, list[int]] = defaultdict(list)
    for metric_id in metric_ids:
        source_grain = source_grains.get(metric_id)
        if source_grain:
            metric_ids_by_grain[source_grain].append(metric_id)
    return metric_ids_by_grain


def _append_timeseries_rows(
    series_map: dict[str, dict],
    rows: list[Mapping[str, Any]],
    metric_id_to_key: dict[int, str],
    group_by_labels: list[str],
) -> None:
    """Append result rows to the series map."""
    for row in rows:
        metric_id = int(row["metric_id"])
        metric_key = metric_id_to_key.get(metric_id)
        if not metric_key:
            continue
        dimensions = {key: row[key] for key in group_by_labels}
        series_key = "|".join(
            [metric_key] + [f"{key}={dimensions.get(key, '')}" for key in group_by_labels],
        )
        entry = series_map.setdefault(
            series_key,
            {
                "metric_key": metric_key,
                "dimensions": dimensions,
                "points": [],
            },
        )
        entry["points"].append({"time_start_ts": row["time_start_ts"], "value": row["value"]})


def _finalize_series(
    series_map: dict[str, dict],
    metric_order: dict[str, int],
    group_by_labels: list[str],
) -> list[dict]:
    """Sort timeseries points and series order for deterministic output."""
    series = list(series_map.values())
    for entry in series:
        entry["points"].sort(key=lambda point: point["time_start_ts"])

    def series_sort_key(item: dict) -> tuple:
        metric_idx = metric_order.get(item["metric_key"], 0)
        dims = tuple(item["dimensions"].get(key, "") for key in group_by_labels)
        return (metric_idx, dims)

    series.sort(key=series_sort_key)
    return series


def _append_aggregate_rows(
    items: list[dict],
    rows: list[Mapping[str, Any]],
    metric_id_to_key: dict[int, str],
    group_by_labels: list[str],
) -> None:
    """Append aggregate rows to the output list."""
    for row in rows:
        metric_id = int(row["metric_id"])
        metric_key = metric_id_to_key.get(metric_id)
        if not metric_key:
            continue
        dimensions = {key: row[key] for key in group_by_labels}
        items.append(
            {
                "metric_key": metric_key,
                "dimensions": dimensions,
                "value": row["value"],
            },
        )


def _finalize_groups(
    items: list[dict],
    metric_order: dict[str, int],
    group_by_labels: list[str],
) -> list[dict]:
    """Sort aggregate groups for deterministic output."""

    def group_sort_key(item: dict) -> tuple:
        metric_idx = metric_order.get(item["metric_key"], 0)
        dims = tuple(item["dimensions"].get(key, "") for key in group_by_labels)
        return (metric_idx, dims)

    items.sort(key=group_sort_key)
    return items


@router.post("/timeseries")
async def post_timeseries(
    payload: Annotated[TimeseriesQuery, Body()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Return timeseries data for one or more metrics."""
    requested_grain = normalize_grain(payload.grain)
    if not is_supported_grain(requested_grain):
        raise HTTPException(status_code=400, detail="unsupported grain")
    metric_meta = await resolve_metric_ids(connection, payload.metric_keys)
    metric_ids = [int(meta["metric_id"]) for meta in metric_meta.values()]
    source_grains = await resolve_metric_source_grains(
        connection,
        metric_ids,
        requested_grain,
    )
    metric_order = {key: idx for idx, key in enumerate(payload.metric_keys)}
    metric_id_to_key = {int(meta["metric_id"]): key for key, meta in metric_meta.items()}

    aggregation_groups = _build_aggregation_groups(metric_meta)
    group_by_labels, dimension_ids = await _resolve_dimension_context(
        connection,
        payload.group_by,
    )
    filter_pairs = _build_filter_pairs(payload.filters or [])

    series_map: dict[str, dict] = {}

    for aggregation, metric_ids in aggregation_groups.items():
        metric_ids_by_grain = _group_metric_ids_by_grain(metric_ids, source_grains)
        if not metric_ids_by_grain:
            continue
        agg_expr = _aggregation_expression(aggregation).label("value")
        time_bucket = build_time_bucket(
            requested_grain,
            MetricObservation.time_start_ts,
        ).label("time_start_ts")
        for source_grain, source_metric_ids in metric_ids_by_grain.items():
            stmt = (
                select(
                    MetricSeries.metric_id,
                    time_bucket,
                    agg_expr,
                )
                .join(
                    MetricSeries,
                    MetricSeries.series_id == MetricObservation.series_id,
                )
                .where(
                    MetricSeries.metric_id.in_(source_metric_ids),
                    MetricSeries.grain == source_grain,
                    MetricObservation.time_start_ts >= payload.start_time,
                    MetricObservation.time_start_ts < payload.end_time,
                )
            )

            if filter_pairs:
                stmt = await apply_dimension_pairs(
                    stmt,
                    connection,
                    filter_pairs,
                    "timeseries",
                )

            stmt, group_by_labels = await apply_group_by(
                stmt,
                connection,
                group_by_labels,
                "timeseries",
                dimension_ids,
            )

            stmt = stmt.group_by(
                MetricSeries.metric_id,
                time_bucket,
            )
            stmt = stmt.order_by(time_bucket)

            result = await connection.execute(stmt)
            rows = result.mappings().all()
            _append_timeseries_rows(
                series_map,
                rows,
                metric_id_to_key,
                group_by_labels,
            )

    series = _finalize_series(series_map, metric_order, group_by_labels)

    return {
        "metric_keys": payload.metric_keys,
        "grain": requested_grain,
        "series": series,
    }


@router.get("/latest")
async def get_latest(
    metric_key: Annotated[str, Query()],
    grain: Annotated[str, Query()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
    dimensions: Annotated[list[str] | None, Query()] = None,
) -> dict:
    """Return the latest observation for a metric."""
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
    filter_pairs = parse_dimension_pairs(dimensions)

    time_bucket = build_time_bucket(requested_grain, MetricObservation.time_start_ts).label(
        "time_start_ts"
    )
    stmt = (
        select(
            time_bucket,
            MetricObservation.value_num,
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

    if filter_pairs:
        stmt = await apply_dimension_pairs(stmt, connection, filter_pairs, "latest")

    stmt = stmt.order_by(MetricObservation.time_start_ts.desc()).limit(1)
    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": requested_grain,
        "time_start_ts": row["time_start_ts"] if row else None,
        "value": row["value_num"] if row else None,
    }


@router.post("/aggregate")
async def post_aggregate(
    payload: Annotated[AggregateQuery, Body()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Aggregate metrics over a time range."""
    requested_grain = normalize_grain(payload.grain)
    if not is_supported_grain(requested_grain):
        raise HTTPException(status_code=400, detail="unsupported grain")
    metric_meta = await resolve_metric_ids(connection, payload.metric_keys)
    metric_ids = [int(meta["metric_id"]) for meta in metric_meta.values()]
    source_grains = await resolve_metric_source_grains(
        connection,
        metric_ids,
        requested_grain,
    )
    metric_order = {key: idx for idx, key in enumerate(payload.metric_keys)}
    metric_id_to_key = {int(meta["metric_id"]): key for key, meta in metric_meta.items()}

    aggregation_groups = _build_aggregation_groups(metric_meta)
    group_by_labels, dimension_ids = await _resolve_dimension_context(
        connection,
        payload.group_by,
    )
    filter_pairs = _build_filter_pairs(payload.filters or [])

    items: list[dict] = []

    for aggregation, metric_ids in aggregation_groups.items():
        metric_ids_by_grain = _group_metric_ids_by_grain(metric_ids, source_grains)
        if not metric_ids_by_grain:
            continue
        agg_expr = _aggregation_expression(aggregation).label("value")
        for source_grain, source_metric_ids in metric_ids_by_grain.items():
            stmt = (
                select(
                    MetricSeries.metric_id,
                    agg_expr,
                )
                .join(
                    MetricSeries,
                    MetricSeries.series_id == MetricObservation.series_id,
                )
                .where(
                    MetricSeries.metric_id.in_(source_metric_ids),
                    MetricSeries.grain == source_grain,
                    MetricObservation.time_start_ts >= payload.start_time,
                    MetricObservation.time_start_ts < payload.end_time,
                )
            )

            if filter_pairs:
                stmt = await apply_dimension_pairs(
                    stmt,
                    connection,
                    filter_pairs,
                    "agg",
                )

            stmt, group_by_labels = await apply_group_by(
                stmt,
                connection,
                group_by_labels,
                "agg",
                dimension_ids,
            )

            stmt = stmt.group_by(MetricSeries.metric_id)
            result = await connection.execute(stmt)
            rows = result.mappings().all()
            _append_aggregate_rows(items, rows, metric_id_to_key, group_by_labels)

    items = _finalize_groups(items, metric_order, group_by_labels)

    return {
        "metric_keys": payload.metric_keys,
        "grain": requested_grain,
        "groups": items,
    }


@router.post("/topk")
async def post_topk(
    payload: Annotated[TopKQuery, Body()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Return the top-K results for a metric group-by."""
    requested_grain = normalize_grain(payload.grain)
    if not is_supported_grain(requested_grain):
        raise HTTPException(status_code=400, detail="unsupported grain")
    metric_id = await resolve_metric_id(connection, payload.metric_key)
    source_grains = await resolve_metric_source_grains(
        connection,
        [metric_id],
        requested_grain,
    )
    source_grain = source_grains.get(metric_id, requested_grain)

    metric_result = await connection.execute(
        select(MetricDefinition.aggregation).where(MetricDefinition.metric_id == metric_id),
    )
    aggregation = metric_result.scalar_one_or_none() or "sum"
    agg_expr = _aggregation_expression(aggregation).label("value")

    stmt = (
        select(agg_expr)
        .join(
            MetricSeries,
            MetricSeries.series_id == MetricObservation.series_id,
        )
        .where(
            MetricSeries.metric_id == metric_id,
            MetricSeries.grain == source_grain,
            MetricObservation.time_start_ts >= payload.start_time,
            MetricObservation.time_start_ts < payload.end_time,
        )
    )

    filter_pairs = _build_filter_pairs(payload.filters or [])
    if filter_pairs:
        stmt = await apply_dimension_pairs(stmt, connection, filter_pairs, "topk")

    stmt, group_by_labels = await apply_group_by(
        stmt,
        connection,
        payload.group_by or [],
        "topk",
    )

    order_expr = agg_expr.asc() if payload.order == "asc" else agg_expr.desc()
    stmt = stmt.order_by(order_expr).limit(payload.k)

    result = await connection.execute(stmt)
    rows = result.mappings().all()
    items = []
    for row in rows:
        dimensions = {key: row[key] for key in group_by_labels}
        items.append({"dimensions": dimensions, "value": row["value"]})

    return {
        "metric_key": payload.metric_key,
        "grain": requested_grain,
        "items": items,
    }


def _build_filter_pairs(filters: list) -> list[tuple[int, int]]:
    """Build dimension_id/value_id pairs from filter payloads."""
    pairs: list[tuple[int, int]] = []
    for flt in filters:
        for value_id in flt.value_ids:
            pairs.append((int(flt.dimension_id), int(value_id)))
    return pairs
