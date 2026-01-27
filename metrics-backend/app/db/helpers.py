"""Database helper utilities for metrics queries."""

from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import func, literal_column, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from app.db.postgres import PostgresExecutor
from app.db.schema import DimensionDefinition, MetricDefinition, MetricSeries

GRAIN_ORDER = ("30m", "hour", "day", "week", "biweek", "month", "quarter")
GRAIN_RANK = {grain: idx for idx, grain in enumerate(GRAIN_ORDER)}


def normalize_grain(grain: str) -> str:
    """Normalize a grain string for comparisons."""
    return grain.strip().lower()


def is_supported_grain(grain: str) -> bool:
    """Return whether a grain is supported."""
    return normalize_grain(grain) in GRAIN_RANK


def build_time_bucket(grain: str, column: ColumnElement) -> ColumnElement:
    """Return a time bucket expression for supported grains."""
    normalized = normalize_grain(grain)
    if normalized == "30m":
        interval = literal_column("interval '30 minutes'")
        half_hour = func.floor(func.date_part("minute", column) / 30) * interval
        return func.date_trunc("hour", column) + half_hour
    if normalized == "biweek":
        interval = literal_column("interval '1 week'")
        week_start = func.date_trunc("week", column)
        week_offset = (func.extract("week", column) % 2) * interval
        return week_start - week_offset
    return func.date_trunc(normalized, column)


async def resolve_metric_id(connection: PostgresExecutor, metric_key: str) -> int:
    """Resolve a metric key into its ID, or raise 404."""
    stmt = select(MetricDefinition.metric_id).where(MetricDefinition.metric_key == metric_key)
    result = await connection.execute(stmt)
    metric_id = result.scalar_one_or_none()
    if metric_id is None:
        raise HTTPException(status_code=404, detail="metric_key not found")
    return int(metric_id)


async def resolve_metric_ids(
    connection: PostgresExecutor,
    metric_keys: Iterable[str],
) -> dict[str, dict[str, int | str]]:
    """Resolve metric keys to IDs and aggregation types."""
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
    connection: PostgresExecutor,
    dimension_keys: Iterable[str],
) -> dict[str, int]:
    """Resolve dimension keys to IDs."""
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
        missing_keys = ", ".join(missing)
        raise HTTPException(
            status_code=404,
            detail=f"dimension_key not found: {missing_keys}",
        )
    return found


def apply_pagination(stmt: Select, limit: int | None, offset: int | None) -> Select:
    """Apply limit/offset pagination to a SQL statement."""
    if limit is not None:
        stmt = stmt.limit(limit)
    if offset is not None:
        stmt = stmt.offset(offset)
    return stmt


def _select_source_grain(grains: set[str], requested_grain: str) -> str:
    """Choose the best source grain for a requested grain."""
    if not grains:
        return requested_grain
    requested_rank = GRAIN_RANK.get(normalize_grain(requested_grain), 999)
    ranked = [(GRAIN_RANK.get(normalize_grain(grain), 999), grain) for grain in grains]
    candidates = [pair for pair in ranked if pair[0] <= requested_rank]
    if candidates:
        return max(candidates, key=lambda pair: pair[0])[1]
    return min(ranked, key=lambda pair: pair[0])[1]


async def resolve_metric_source_grains(
    connection: PostgresExecutor,
    metric_ids: Iterable[int],
    requested_grain: str,
) -> dict[int, str]:
    """Resolve the stored grain used to satisfy a requested grain."""
    ids = list(dict.fromkeys(metric_ids))
    if not ids:
        return {}
    stmt = select(MetricSeries.metric_id, MetricSeries.grain).where(
        MetricSeries.metric_id.in_(ids),
    )
    result = await connection.execute(stmt)
    rows = result.mappings().all()
    grains_by_metric: dict[int, set[str]] = {metric_id: set() for metric_id in ids}
    for row in rows:
        metric_id = int(row["metric_id"])
        grain = str(row["grain"])
        grains_by_metric.setdefault(metric_id, set()).add(grain)

    source_grains: dict[int, str] = {}
    for metric_id, grains in grains_by_metric.items():
        if not grains:
            continue
        source_grains[metric_id] = _select_source_grain(grains, requested_grain)
    return source_grains
