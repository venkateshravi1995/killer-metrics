from collections import defaultdict
from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import func, select

from app.api.routes.v1.utils import (
    apply_dimension_pairs,
    apply_dimension_value_filters,
    apply_group_by,
    parse_dimension_pairs,
)
from app.api.schemas.queries import AggregateQuery, TimeseriesQuery, TopKQuery
from app.db.postgres import PostgresExecutor
from app.db.helpers import resolve_dimension_ids, resolve_metric_id, resolve_metric_ids
from app.db.schema import MetricDefinition, MetricObservation, MetricSeries
from app.db.session import get_connection

router = APIRouter(prefix="/v1/query", tags=["queries"])


def _aggregation_expression(aggregation: str):
    normalized = aggregation.lower()
    if normalized == "avg":
        return func.avg(MetricObservation.value_num)
    if normalized == "min":
        return func.min(MetricObservation.value_num)
    if normalized == "max":
        return func.max(MetricObservation.value_num)
    return func.sum(MetricObservation.value_num)


@router.post("/timeseries")
async def post_timeseries(
    payload: TimeseriesQuery = Body(...),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    metric_meta = await resolve_metric_ids(connection, payload.metric_keys)
    metric_order = {key: idx for idx, key in enumerate(payload.metric_keys)}
    metric_id_to_key = {
        meta["metric_id"]: key for key, meta in metric_meta.items()
    }

    aggregation_groups: dict[str, list[int]] = defaultdict(list)
    for key, meta in metric_meta.items():
        aggregation = str(meta["aggregation"]).lower() if meta["aggregation"] else "sum"
        aggregation_groups[aggregation].append(int(meta["metric_id"]))

    group_by_labels = list(dict.fromkeys(payload.group_by))
    filter_keys = [flt.dimension_key for flt in payload.filters]
    dimension_keys = list(dict.fromkeys(group_by_labels + filter_keys))
    dimension_ids = (
        await resolve_dimension_ids(connection, dimension_keys) if dimension_keys else {}
    )

    series_map: dict[str, dict] = {}

    for aggregation, metric_ids in aggregation_groups.items():
        agg_expr = _aggregation_expression(aggregation).label("value")
        stmt = select(
            MetricSeries.metric_id,
            MetricObservation.time_start_ts,
            agg_expr,
        ).join(
            MetricSeries,
            MetricSeries.series_id == MetricObservation.series_id,
        ).where(
            MetricSeries.metric_id.in_(metric_ids),
            MetricSeries.grain == payload.grain,
            MetricObservation.time_start_ts >= payload.start_time,
            MetricObservation.time_start_ts < payload.end_time,
        )

        stmt = await apply_dimension_value_filters(
            stmt, connection, payload.filters or [], "timeseries", dimension_ids
        )

        stmt, group_by_labels = await apply_group_by(
            stmt, connection, group_by_labels, "timeseries", dimension_ids
        )

        stmt = stmt.group_by(
            MetricSeries.metric_id,
            MetricObservation.time_start_ts,
        )
        stmt = stmt.order_by(MetricObservation.time_start_ts)

        result = await connection.execute(stmt)
        rows = result.mappings().all()
        for row in rows:
            metric_id = int(row["metric_id"])
            metric_key = metric_id_to_key.get(metric_id)
            if not metric_key:
                continue
            dimensions = {key: row[key] for key in group_by_labels}
            series_key = "|".join(
                [metric_key]
                + [f"{key}={dimensions.get(key, '')}" for key in group_by_labels]
            )
            entry = series_map.setdefault(
                series_key,
                {
                    "metric_key": metric_key,
                    "dimensions": dimensions,
                    "points": [],
                },
            )
            entry["points"].append(
                {"time_start_ts": row["time_start_ts"], "value": row["value"]}
            )

    series = list(series_map.values())
    for entry in series:
        entry["points"].sort(key=lambda point: point["time_start_ts"])

    def series_sort_key(item: dict) -> tuple:
        metric_idx = metric_order.get(item["metric_key"], 0)
        dims = tuple(item["dimensions"].get(key, "") for key in group_by_labels)
        return (metric_idx, dims)

    series.sort(key=series_sort_key)

    return {
        "metric_keys": payload.metric_keys,
        "grain": payload.grain,
        "series": series,
    }


@router.get("/latest")
async def get_latest(
    metric_key: str = Query(...),
    grain: str = Query(...),
    dimensions: list[str] | None = Query(None),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    metric_id = await resolve_metric_id(connection, metric_key)
    filters = parse_dimension_pairs(dimensions)

    stmt = select(
        MetricObservation.time_start_ts,
        MetricObservation.value_num,
    ).join(
        MetricSeries,
        MetricSeries.series_id == MetricObservation.series_id,
    ).where(
        MetricSeries.metric_id == metric_id,
        MetricSeries.grain == grain,
    )

    stmt = await apply_dimension_pairs(stmt, connection, filters, "latest")

    stmt = stmt.order_by(MetricObservation.time_start_ts.desc()).limit(1)
    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": grain,
        "time_start_ts": row["time_start_ts"] if row else None,
        "value": row["value_num"] if row else None,
    }


@router.post("/aggregate")
async def post_aggregate(
    payload: AggregateQuery = Body(...),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    metric_meta = await resolve_metric_ids(connection, payload.metric_keys)
    metric_order = {key: idx for idx, key in enumerate(payload.metric_keys)}
    metric_id_to_key = {
        meta["metric_id"]: key for key, meta in metric_meta.items()
    }

    aggregation_groups: dict[str, list[int]] = defaultdict(list)
    for key, meta in metric_meta.items():
        aggregation = str(meta["aggregation"]).lower() if meta["aggregation"] else "sum"
        aggregation_groups[aggregation].append(int(meta["metric_id"]))

    group_by_labels = list(dict.fromkeys(payload.group_by))
    filter_keys = [flt.dimension_key for flt in payload.filters]
    dimension_keys = list(dict.fromkeys(group_by_labels + filter_keys))
    dimension_ids = (
        await resolve_dimension_ids(connection, dimension_keys) if dimension_keys else {}
    )

    items: list[dict] = []

    for aggregation, metric_ids in aggregation_groups.items():
        agg_expr = _aggregation_expression(aggregation).label("value")
        stmt = select(
            MetricSeries.metric_id,
            agg_expr,
        ).join(
            MetricSeries,
            MetricSeries.series_id == MetricObservation.series_id,
        ).where(
            MetricSeries.metric_id.in_(metric_ids),
            MetricSeries.grain == payload.grain,
            MetricObservation.time_start_ts >= payload.start_time,
            MetricObservation.time_start_ts < payload.end_time,
        )

        stmt = await apply_dimension_value_filters(
            stmt, connection, payload.filters or [], "agg", dimension_ids
        )

        stmt, group_by_labels = await apply_group_by(
            stmt, connection, group_by_labels, "agg", dimension_ids
        )

        stmt = stmt.group_by(MetricSeries.metric_id)
        result = await connection.execute(stmt)
        rows = result.mappings().all()
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
                }
            )

    def group_sort_key(item: dict) -> tuple:
        metric_idx = metric_order.get(item["metric_key"], 0)
        dims = tuple(item["dimensions"].get(key, "") for key in group_by_labels)
        return (metric_idx, dims)

    items.sort(key=group_sort_key)

    return {
        "metric_keys": payload.metric_keys,
        "grain": payload.grain,
        "groups": items,
    }


@router.post("/topk")
async def post_topk(
    payload: TopKQuery = Body(...),
    connection: PostgresExecutor = Depends(get_connection),
) -> dict:
    metric_id = await resolve_metric_id(connection, payload.metric_key)

    metric_result = await connection.execute(
        select(MetricDefinition.aggregation).where(MetricDefinition.metric_id == metric_id)
    )
    aggregation = metric_result.scalar_one_or_none() or "sum"
    agg_expr = _aggregation_expression(aggregation).label("value")

    stmt = select(agg_expr).join(
        MetricSeries,
        MetricSeries.series_id == MetricObservation.series_id,
    ).where(
        MetricSeries.metric_id == metric_id,
        MetricSeries.grain == payload.grain,
        MetricObservation.time_start_ts >= payload.start_time,
        MetricObservation.time_start_ts < payload.end_time,
    )

    stmt = await apply_dimension_value_filters(
        stmt, connection, payload.filters or [], "topk"
    )

    stmt, group_by_labels = await apply_group_by(
        stmt, connection, payload.group_by or [], "topk"
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
        "grain": payload.grain,
        "items": items,
    }
