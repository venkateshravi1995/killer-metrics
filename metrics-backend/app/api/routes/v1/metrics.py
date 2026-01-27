"""Metric catalog endpoints."""

from collections.abc import Sequence
from io import BytesIO
import hashlib
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Response, UploadFile
import pandas as pd
from sqlalchemy import func, literal, literal_column, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from app.api.routes.v1.utils import apply_dimension_pairs, parse_dimension_pairs, set_cache_control
from app.api.schemas.metrics import MetricListQuery, MetricSearchFilters, MetricSearchRequest
from app.db.helpers import (
    apply_pagination,
    build_time_bucket,
    is_supported_grain,
    normalize_grain,
    resolve_metric_id,
    resolve_metric_source_grains,
)
from app.db.postgres import PostgresExecutor
from app.db.schema import (
    DimensionDefinition,
    DimensionSet,
    DimensionSetValue,
    DimensionValue,
    MetricDefinition,
    MetricObservation,
    MetricSeries,
)
from app.db.session import get_connection

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])

DEFAULT_SEARCH_FIELDS = ("metric_name", "metric_description", "metric_type")
SEARCH_FIELD_WEIGHTS = {
    "metric_name": "A",
    "metric_type": "B",
    "metric_description": "C",
}

REQUIRED_UPLOAD_COLUMNS = (
    "metric_key",
    "metric_name",
    "metric_description",
    "metric_type",
    "unit",
    "directionality",
    "aggregation",
    "grain",
    "time_start_ts",
    "time_end_ts",
    "value_num",
    "sample_size",
    "is_estimated",
)

REQUIRED_UPLOAD_VALUES = (
    "metric_key",
    "metric_name",
    "metric_type",
    "aggregation",
    "grain",
    "time_start_ts",
    "value_num",
)


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


def _normalize_upload_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Normalize CSV column names and return dimension columns."""
    normalized = [str(column).strip().lower() for column in df.columns]
    if len(set(normalized)) != len(normalized):
        duplicates = sorted({name for name in normalized if normalized.count(name) > 1})
        detail = ", ".join(duplicates)
        raise HTTPException(status_code=400, detail=f"duplicate columns after normalization: {detail}")
    df = df.rename(columns=dict(zip(df.columns, normalized)))
    missing = [column for column in REQUIRED_UPLOAD_COLUMNS if column not in df.columns]
    if missing:
        detail = ", ".join(missing)
        raise HTTPException(status_code=400, detail=f"missing required columns: {detail}")
    dimension_columns = [column for column in df.columns if column not in REQUIRED_UPLOAD_COLUMNS]
    return df, dimension_columns


def _normalize_boolean(value: object) -> bool | None:
    """Normalize truthy values into booleans; return None for invalid input."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in {"true", "t", "yes", "y", "1"}:
            return True
        if cleaned in {"false", "f", "no", "n", "0", ""}:
            return False
    return None


def _unique_field(
    group: pd.DataFrame,
    field: str,
    metric_key: str,
    *,
    required: bool,
    lower: bool = False,
) -> str | None:
    values = group[field].dropna().astype("string").str.strip()
    values = values[values != ""]
    if lower:
        values = values.str.lower()
    unique_values = list(dict.fromkeys(values.tolist()))
    if len(unique_values) > 1:
        raise HTTPException(
            status_code=400,
            detail=f"conflicting {field} values for metric_key: {metric_key}",
        )
    if required and not unique_values:
        raise HTTPException(
            status_code=400,
            detail=f"missing {field} for metric_key: {metric_key}",
        )
    return unique_values[0] if unique_values else None


def _build_set_hash(pairs: list[tuple[str, str]]) -> str:
    payload = "|".join(f"{key}={value}" for key, value in pairs)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
    filter_pairs = parse_dimension_pairs(dimensions)

    time_bucket = build_time_bucket(requested_grain, MetricObservation.time_start_ts)
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

    if filter_pairs:
        stmt = await apply_dimension_pairs(stmt, connection, filter_pairs, "availability")

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
    filter_pairs = parse_dimension_pairs(dimensions)

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

    if filter_pairs:
        stmt = await apply_dimension_pairs(stmt, connection, filter_pairs, "freshness")

    stmt = stmt.order_by(MetricObservation.time_start_ts.desc()).limit(1)
    result = await connection.execute(stmt)
    row = result.mappings().first()
    return {
        "metric_key": metric_key,
        "grain": requested_grain,
        "latest_time_start_ts": row["latest_time_start_ts"] if row else None,
        "latest_ingested_ts": row["latest_ingested_ts"] if row else None,
    }


@router.post("/upload")
async def upload_metrics_csv(
    file: Annotated[UploadFile, File()],
    connection: Annotated[PostgresExecutor, Depends(get_connection)],
) -> dict:
    """Upload metric observations from a CSV file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="file must be a CSV")
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="file is empty")
    try:
        df = pd.read_csv(BytesIO(payload))
    except Exception as exc:  # pragma: no cover - pandas error formatting is varied
        raise HTTPException(status_code=400, detail="invalid CSV file") from exc
    if df.empty:
        raise HTTPException(status_code=400, detail="file contains no rows")

    df, dimension_columns = _normalize_upload_columns(df)

    for column in REQUIRED_UPLOAD_VALUES:
        series = df[column].astype("string").str.strip()
        if series.isna().any() or (series == "").any():
            raise HTTPException(status_code=400, detail=f"{column} is required")

    df["metric_key"] = df["metric_key"].astype("string").str.strip().str.lower()
    df["metric_name"] = df["metric_name"].astype("string").str.strip()
    df["metric_description"] = (
        df["metric_description"].astype("string").str.strip().replace("", pd.NA)
    )
    df["metric_type"] = df["metric_type"].astype("string").str.strip().str.lower()
    df["unit"] = df["unit"].astype("string").str.strip().replace("", pd.NA)
    df["directionality"] = df["directionality"].astype("string").str.strip().str.lower()
    df["directionality"] = df["directionality"].replace("", pd.NA)
    df["aggregation"] = df["aggregation"].astype("string").str.strip().str.lower()
    df["grain"] = df["grain"].astype("string").str.strip().str.lower()

    grains = set(df["grain"].dropna().tolist())
    unsupported = [grain for grain in grains if not is_supported_grain(grain)]
    if unsupported:
        detail = ", ".join(sorted(unsupported))
        raise HTTPException(status_code=400, detail=f"unsupported grain(s): {detail}")

    start_ts = pd.to_datetime(df["time_start_ts"], errors="coerce", utc=True)
    if start_ts.isna().any():
        raise HTTPException(status_code=400, detail="invalid time_start_ts values")
    end_raw = df["time_end_ts"]
    end_ts = pd.to_datetime(end_raw, errors="coerce", utc=True)
    invalid_end = end_raw.notna() & end_ts.isna()
    if invalid_end.any():
        raise HTTPException(status_code=400, detail="invalid time_end_ts values")
    if ((~end_ts.isna()) & (end_ts <= start_ts)).any():
        raise HTTPException(status_code=400, detail="time_end_ts must be after time_start_ts")

    df["time_start_ts"] = start_ts.dt.to_pydatetime()
    df["time_end_ts"] = end_ts.dt.to_pydatetime()

    value_num = pd.to_numeric(df["value_num"], errors="coerce")
    if value_num.isna().any():
        raise HTTPException(status_code=400, detail="invalid value_num values")
    df["value_num"] = value_num.astype(float)

    sample_size = pd.to_numeric(df["sample_size"], errors="coerce")
    invalid_sample = df["sample_size"].notna() & sample_size.isna()
    if invalid_sample.any():
        raise HTTPException(status_code=400, detail="invalid sample_size values")
    df["sample_size"] = sample_size

    df["is_estimated"] = df["is_estimated"].map(_normalize_boolean)
    if df["is_estimated"].isna().any():
        raise HTTPException(status_code=400, detail="invalid is_estimated values")

    for column in dimension_columns:
        df[column] = df[column].astype("string").str.strip()
        df[column] = df[column].replace("", pd.NA)

    metric_rows: list[dict[str, object]] = []
    for metric_key, group in df.groupby("metric_key"):
        metric_rows.append(
            {
                "metric_key": metric_key,
                "metric_name": _unique_field(group, "metric_name", metric_key, required=True),
                "metric_description": _unique_field(
                    group,
                    "metric_description",
                    metric_key,
                    required=False,
                ),
                "metric_type": _unique_field(
                    group,
                    "metric_type",
                    metric_key,
                    required=True,
                    lower=True,
                ),
                "unit": _unique_field(group, "unit", metric_key, required=False),
                "directionality": _unique_field(
                    group,
                    "directionality",
                    metric_key,
                    required=False,
                    lower=True,
                ),
                "aggregation": _unique_field(
                    group,
                    "aggregation",
                    metric_key,
                    required=True,
                    lower=True,
                ),
            },
        )

    dimension_rows = [
        {
            "dimension_key": dimension_key,
            "dimension_name": dimension_key.replace("_", " ").title(),
        }
        for dimension_key in dimension_columns
    ]

    session = connection.session
    try:
        metrics_upserted = 0
        if metric_rows:
            stmt = pg_insert(MetricDefinition).values(metric_rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=[MetricDefinition.metric_key],
                set_={
                    "metric_name": stmt.excluded.metric_name,
                    "metric_description": stmt.excluded.metric_description,
                    "metric_type": stmt.excluded.metric_type,
                    "unit": stmt.excluded.unit,
                    "directionality": stmt.excluded.directionality,
                    "aggregation": stmt.excluded.aggregation,
                },
            )
            result = await session.execute(stmt)
            metrics_upserted = result.rowcount or 0

        if dimension_rows:
            stmt = pg_insert(DimensionDefinition).values(dimension_rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=[DimensionDefinition.dimension_key],
                set_={"dimension_name": stmt.excluded.dimension_name},
            )
            await session.execute(stmt)

        metric_keys = [row["metric_key"] for row in metric_rows]
        metric_ids: dict[str, int] = {}
        if metric_keys:
            stmt = select(
                MetricDefinition.metric_key,
                MetricDefinition.metric_id,
            ).where(MetricDefinition.metric_key.in_(metric_keys))
            rows = (await session.execute(stmt)).mappings().all()
            metric_ids = {row["metric_key"]: int(row["metric_id"]) for row in rows}

        dimension_ids: dict[str, int] = {}
        if dimension_columns:
            stmt = select(
                DimensionDefinition.dimension_key,
                DimensionDefinition.dimension_id,
            ).where(DimensionDefinition.dimension_key.in_(dimension_columns))
            rows = (await session.execute(stmt)).mappings().all()
            dimension_ids = {row["dimension_key"]: int(row["dimension_id"]) for row in rows}

        dimension_value_rows: list[dict[str, object]] = []
        for dimension_key in dimension_columns:
            values = df[dimension_key].dropna().tolist()
            if not values:
                continue
            dimension_id = dimension_ids[dimension_key]
            for value in dict.fromkeys(values):
                dimension_value_rows.append(
                    {
                        "dimension_id": dimension_id,
                        "value": str(value),
                    },
                )

        dimension_values_inserted = 0
        if dimension_value_rows:
            stmt = pg_insert(DimensionValue).values(dimension_value_rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=[DimensionValue.dimension_id, DimensionValue.value],
            )
            result = await session.execute(stmt)
            dimension_values_inserted = result.rowcount or 0

        dimension_value_ids: dict[tuple[int, str], int] = {}
        for dimension_key in dimension_columns:
            values = df[dimension_key].dropna().tolist()
            if not values:
                continue
            dimension_id = dimension_ids[dimension_key]
            unique_values = list(dict.fromkeys([str(value) for value in values]))
            stmt = select(DimensionValue.value_id, DimensionValue.value).where(
                DimensionValue.dimension_id == dimension_id,
                DimensionValue.value.in_(unique_values),
            )
            rows = (await session.execute(stmt)).mappings().all()
            for row in rows:
                dimension_value_ids[(dimension_id, row["value"])] = int(row["value_id"])

        dimension_sets: dict[str, list[tuple[int, int]]] = {}
        row_set_hashes: list[str] = []
        records = df.to_dict(orient="records")
        for record in records:
            pairs: list[tuple[str, str, int, int]] = []
            for dimension_key in dimension_columns:
                value = record.get(dimension_key)
                if value is None or pd.isna(value):
                    continue
                dimension_id = dimension_ids[dimension_key]
                value_id = dimension_value_ids[(dimension_id, str(value))]
                pairs.append((dimension_key, str(value), dimension_id, value_id))
            pairs_sorted = sorted(pairs, key=lambda item: item[0])
            hash_pairs = [(key, value) for key, value, _, _ in pairs_sorted]
            set_hash = _build_set_hash(hash_pairs)
            if set_hash not in dimension_sets:
                dimension_sets[set_hash] = [
                    (dimension_id, value_id) for _, _, dimension_id, value_id in pairs_sorted
                ]
            row_set_hashes.append(set_hash)

        dimension_sets_inserted = 0
        if dimension_sets:
            stmt = pg_insert(DimensionSet).values(
                [{"set_hash": set_hash} for set_hash in dimension_sets],
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=[DimensionSet.set_hash])
            result = await session.execute(stmt)
            dimension_sets_inserted = result.rowcount or 0

        set_ids: dict[str, int] = {}
        if dimension_sets:
            stmt = select(DimensionSet.set_hash, DimensionSet.set_id).where(
                DimensionSet.set_hash.in_(list(dimension_sets.keys())),
            )
            rows = (await session.execute(stmt)).mappings().all()
            set_ids = {row["set_hash"]: int(row["set_id"]) for row in rows}

        set_value_rows: list[dict[str, object]] = []
        for set_hash, pairs in dimension_sets.items():
            set_id = set_ids[set_hash]
            for dimension_id, value_id in pairs:
                set_value_rows.append(
                    {
                        "set_id": set_id,
                        "dimension_id": dimension_id,
                        "value_id": value_id,
                    },
                )
        if set_value_rows:
            stmt = pg_insert(DimensionSetValue).values(set_value_rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=[DimensionSetValue.set_id, DimensionSetValue.value_id],
            )
            await session.execute(stmt)

        series_rows: list[dict[str, object]] = []
        series_keys: set[tuple[int, str, int]] = set()
        for record, set_hash in zip(records, row_set_hashes, strict=True):
            metric_id = metric_ids[record["metric_key"]]
            grain = normalize_grain(record["grain"])
            set_id = set_ids[set_hash]
            series_key = (metric_id, grain, set_id)
            if series_key in series_keys:
                continue
            series_keys.add(series_key)
            series_rows.append(
                {
                    "metric_id": metric_id,
                    "grain": grain,
                    "set_id": set_id,
                },
            )

        metric_series_inserted = 0
        if series_rows:
            stmt = pg_insert(MetricSeries).values(series_rows)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=[MetricSeries.metric_id, MetricSeries.grain, MetricSeries.set_id],
            )
            result = await session.execute(stmt)
            metric_series_inserted = result.rowcount or 0

        series_ids: dict[tuple[int, str, int], int] = {}
        if series_keys:
            metric_id_values = {metric_id for metric_id, _, _ in series_keys}
            set_id_values = {set_id for _, _, set_id in series_keys}
            grains = {grain for _, grain, _ in series_keys}
            stmt = select(
                MetricSeries.metric_id,
                MetricSeries.grain,
                MetricSeries.set_id,
                MetricSeries.series_id,
            ).where(
                MetricSeries.metric_id.in_(metric_id_values),
                MetricSeries.set_id.in_(set_id_values),
                MetricSeries.grain.in_(grains),
            )
            rows = (await session.execute(stmt)).mappings().all()
            series_ids = {
                (int(row["metric_id"]), row["grain"], int(row["set_id"])): int(row["series_id"])
                for row in rows
            }

        observation_rows: list[dict[str, object]] = []
        for record, set_hash in zip(records, row_set_hashes, strict=True):
            metric_id = metric_ids[record["metric_key"]]
            grain = normalize_grain(record["grain"])
            set_id = set_ids[set_hash]
            series_id = series_ids[(metric_id, grain, set_id)]
            sample_size_value = record.get("sample_size")
            sample_size = (
                int(sample_size_value)
                if sample_size_value is not None and not pd.isna(sample_size_value)
                else None
            )
            time_end = record.get("time_end_ts")
            time_end_ts = time_end if time_end is not None and not pd.isna(time_end) else None
            observation_rows.append(
                {
                    "series_id": series_id,
                    "time_start_ts": record["time_start_ts"],
                    "time_end_ts": time_end_ts,
                    "value_num": float(record["value_num"]),
                    "sample_size": sample_size,
                    "is_estimated": bool(record["is_estimated"]),
                },
            )

        observations_inserted = 0
        if observation_rows:
            stmt = pg_insert(MetricObservation).values(observation_rows)
            result = await session.execute(stmt)
            observations_inserted = result.rowcount or 0

        await session.commit()
    except Exception:
        await session.rollback()
        raise

    return {
        "rows": len(df.index),
        "metrics_upserted": metrics_upserted,
        "dimensions_upserted": len(dimension_rows),
        "dimension_values_inserted": dimension_values_inserted,
        "dimension_sets_inserted": dimension_sets_inserted,
        "metric_series_inserted": metric_series_inserted,
        "metric_observations_inserted": observations_inserted,
    }
