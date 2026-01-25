from typing import Iterable, Protocol

from fastapi import HTTPException, Response
from sqlalchemy.sql.selectable import Select
from sqlalchemy.orm import aliased

from app.db.postgres import PostgresExecutor
from app.db.helpers import resolve_dimension_ids
from app.db.schema import DimensionSetValue, DimensionValue, MetricSeries

CATALOG_CACHE_CONTROL = "public, max-age=300"


def parse_dimension_pairs(pairs: list[str] | None) -> list[tuple[str, str]]:
    if not pairs:
        return []
    parsed: list[tuple[str, str]] = []
    for raw in pairs:
        if ":" not in raw:
            raise HTTPException(status_code=400, detail=f"invalid dimension filter: {raw}")
        key, value = raw.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not key or not value:
            raise HTTPException(status_code=400, detail=f"invalid dimension filter: {raw}")
        parsed.append((key, value))
    return parsed


def set_cache_control(response: Response) -> None:
    response.headers["Cache-Control"] = CATALOG_CACHE_CONTROL


async def apply_dimension_pairs(
    stmt: Select,
    connection: PostgresExecutor,
    pairs: list[tuple[str, str]],
    alias_prefix: str,
) -> Select:
    if not pairs:
        return stmt
    grouped: dict[str, set[str]] = {}
    for dim_key, dim_value in pairs:
        grouped.setdefault(dim_key, set()).add(dim_value)
    dimension_ids = await resolve_dimension_ids(connection, list(grouped.keys()))
    for idx, (dim_key, values) in enumerate(grouped.items()):
        set_alias = aliased(DimensionSetValue, name=f"{alias_prefix}_set_{idx}")
        value_alias = aliased(DimensionValue, name=f"{alias_prefix}_value_{idx}")
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
                set_alias.dimension_id == dimension_ids[dim_key],
                value_alias.value.in_(list(values)),
            )
        )
    return stmt


class DimensionValueFilter(Protocol):
    dimension_key: str
    values: Iterable[str]


async def apply_dimension_value_filters(
    stmt: Select,
    connection: PostgresExecutor,
    filters: Iterable[DimensionValueFilter],
    alias_prefix: str,
    dimension_ids: dict[str, int] | None = None,
) -> Select:
    filter_list = list(filters)
    if not filter_list:
        return stmt
    if dimension_ids is None:
        dimension_ids = await resolve_dimension_ids(
            connection, [flt.dimension_key for flt in filter_list]
        )
    else:
        missing = [flt.dimension_key for flt in filter_list if flt.dimension_key not in dimension_ids]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"dimension_key not found: {', '.join(sorted(set(missing)))}",
            )
    for idx, flt in enumerate(filter_list):
        set_alias = aliased(DimensionSetValue, name=f"{alias_prefix}_filter_set_{idx}")
        value_alias = aliased(DimensionValue, name=f"{alias_prefix}_filter_value_{idx}")
        if not flt.values:
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
                value_alias.value.in_(list(flt.values)),
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
