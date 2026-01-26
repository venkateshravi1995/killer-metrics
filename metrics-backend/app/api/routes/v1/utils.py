"""Shared utilities for v1 routes."""

from collections.abc import Iterable
from typing import Protocol

from fastapi import HTTPException, Response
from sqlalchemy.orm import aliased
from sqlalchemy.sql.selectable import Select

from app.db.helpers import resolve_dimension_ids
from app.db.postgres import PostgresExecutor
from app.db.schema import DimensionSetValue, DimensionValue, MetricSeries

CATALOG_CACHE_CONTROL = "public, max-age=300"


def parse_dimension_pairs(pairs: list[str] | None) -> list[tuple[int, int]]:
    """Parse dimension_id:value_id filters with optional value lists."""
    if not pairs:
        return []
    parsed: list[tuple[int, int]] = []
    for raw in pairs:
        if ":" not in raw:
            raise HTTPException(status_code=400, detail=f"invalid dimension filter: {raw}")
        left, right = raw.split(":", 1)
        left = left.strip()
        right = right.strip()
        if not left or not right:
            raise HTTPException(status_code=400, detail=f"invalid dimension filter: {raw}")
        if not left.isdigit():
            raise HTTPException(
                status_code=400,
                detail=f"invalid dimension filter (use dimension_id:value_id): {raw}",
            )
        dim_id = int(left)
        value_parts = [part.strip() for part in right.split("|") if part.strip()]
        if not value_parts:
            raise HTTPException(
                status_code=400,
                detail=f"invalid dimension filter (use dimension_id:value_id): {raw}",
            )
        for value in value_parts:
            if not value.isdigit():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "invalid dimension filter "
                        "(use dimension_id:value_id or dimension_id:value_id1|value_id2)"
                        f": {raw}"
                    ),
                )
            parsed.append((dim_id, int(value)))
    return parsed


def set_cache_control(response: Response) -> None:
    """Attach cache-control headers for catalog endpoints."""
    response.headers["Cache-Control"] = CATALOG_CACHE_CONTROL


async def apply_dimension_pairs(
    stmt: Select,
    _connection: PostgresExecutor,
    pairs: list[tuple[int, int]],
    alias_prefix: str,
) -> Select:
    """Apply dimension/value ID filters to a metric series query."""
    if not pairs:
        return stmt
    grouped_ids: dict[int, set[int]] = {}
    for dim_id, value_id in pairs:
        grouped_ids.setdefault(dim_id, set()).add(value_id)
    for idx, (dim_id, value_ids) in enumerate(grouped_ids.items()):
        set_alias = aliased(DimensionSetValue, name=f"{alias_prefix}_id_set_{idx}")
        stmt = stmt.join(
            set_alias,
            set_alias.set_id == MetricSeries.set_id,
        ).where(
            set_alias.dimension_id == dim_id,
            set_alias.value_id.in_(list(value_ids)),
        )
    return stmt


class DimensionValueFilter(Protocol):
    """Typed protocol for dimension filters."""

    dimension_key: str
    values: list[str]


async def apply_dimension_value_filters(
    stmt: Select,
    connection: PostgresExecutor,
    filters: Iterable[DimensionValueFilter],
    alias_prefix: str,
    dimension_ids: dict[str, int] | None = None,
) -> Select:
    """Apply dimension key/value filters to a metric series query."""
    filter_list = list(filters)
    if not filter_list:
        return stmt
    if dimension_ids is None:
        dimension_ids = await resolve_dimension_ids(
            connection,
            [flt.dimension_key for flt in filter_list],
        )
    else:
        missing = [
            flt.dimension_key for flt in filter_list if flt.dimension_key not in dimension_ids
        ]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"dimension_key not found: {', '.join(sorted(set(missing)))}",
            )
    for idx, flt in enumerate(filter_list):
        set_alias = aliased(DimensionSetValue, name=f"{alias_prefix}_filter_set_{idx}")
        value_alias = aliased(DimensionValue, name=f"{alias_prefix}_filter_value_{idx}")
        filter_values = list(flt.values)
        if not filter_values:
            continue
        stmt = (
            stmt.join(
                set_alias,
                set_alias.set_id == MetricSeries.set_id,
            )
            .join(
                value_alias,
                value_alias.value_id == set_alias.value_id,
            )
            .where(
                set_alias.dimension_id == dimension_ids[flt.dimension_key],
                value_alias.value.in_(filter_values),
            )
        )
    return stmt


async def apply_group_by(
    stmt: Select,
    connection: PostgresExecutor,
    group_by: Iterable[str],
    alias_prefix: str,
    dimension_ids: dict[str, int] | None = None,
) -> tuple[Select, list[str]]:
    """Apply group-by dimensions and return label keys."""
    group_keys = list(dict.fromkeys(group_by))
    if not group_keys:
        return stmt, []
    if dimension_ids is None:
        dimension_ids = await resolve_dimension_ids(connection, group_keys)
    else:
        missing = [key for key in group_keys if key not in dimension_ids]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"dimension_key not found: {', '.join(sorted(set(missing)))}",
            )
    group_by_columns = []
    group_by_labels: list[str] = []
    for idx, dim_key in enumerate(group_keys):
        set_alias = aliased(DimensionSetValue, name=f"{alias_prefix}_group_set_{idx}")
        value_alias = aliased(DimensionValue, name=f"{alias_prefix}_group_value_{idx}")
        stmt = (
            stmt.join(
                set_alias,
                set_alias.set_id == MetricSeries.set_id,
            )
            .join(
                value_alias,
                value_alias.value_id == set_alias.value_id,
            )
            .where(set_alias.dimension_id == dimension_ids[dim_key])
        )
        dim_value = value_alias.value.label(dim_key)
        group_by_columns.append(dim_value)
        group_by_labels.append(dim_key)
    if group_by_columns:
        stmt = stmt.add_columns(*group_by_columns).group_by(*group_by_columns)
    return stmt, group_by_labels
