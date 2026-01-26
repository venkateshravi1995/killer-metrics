#!/usr/bin/env python3
"""Seed the metrics database with Faker-generated data."""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from faker import Faker
from sqlalchemy import create_engine, insert

from app.db.postgres import build_database_url
from app.db.schema import (
    DimensionDefinition,
    DimensionSet,
    DimensionSetValue,
    DimensionValue,
    MetricDefinition,
    MetricObservation,
    MetricSeries,
)

MIN_METRICS = 160
MIN_DIMENSIONS = 30
MIN_VALUES_PER_DIM = 20
MIN_OBS_PER_METRIC = 10_000

SLUG_RE = re.compile(r"[^a-zA-Z0-9]+")
DUPLICATE_SET_HASH_ERROR = "Too many duplicate dimension set hashes generated."

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from sqlalchemy import Table
    from sqlalchemy.engine import Engine
    from sqlalchemy.sql.elements import ColumnElement


@dataclass(frozen=True)
class BatchOptions:
    """Batch sizing and labeling for inserts."""

    batch_size: int
    label: str


@dataclass(frozen=True)
class ObservationInsertConfig:
    """Configuration for observation inserts."""

    observations_per_metric: int
    batch_size: int
    grain: str


def slugify(value: str, max_len: int) -> str:
    """Normalize a string into a slug with length bounds."""
    slug = SLUG_RE.sub("_", value.strip().lower()).strip("_")
    if not slug:
        slug = "x"
    if len(slug) > max_len:
        slug = slug[:max_len].rstrip("_")
    return slug


def truncate(value: str, max_len: int) -> str:
    """Trim a string to the maximum length."""
    value = value.strip()
    if len(value) <= max_len:
        return value
    return value[:max_len].rstrip()


def chunked(items: list[dict[str, object]], size: int) -> Iterable[list[dict[str, object]]]:
    """Yield lists of items in fixed-size batches."""
    for index in range(0, len(items), size):
        yield items[index : index + size]


def print_progress(message: str) -> None:
    """Log progress messages to stdout."""
    logger.info(message)


def insert_batches(
    engine: Engine,
    table: Table,
    rows: list[dict[str, object]],
    batch_size: int,
    label: str,
) -> None:
    """Insert rows into a table using chunked batches."""
    total = len(rows)
    if total == 0:
        print_progress(f"{label}: nothing to insert")
        return
    for batch_index, batch in enumerate(chunked(rows, batch_size), start=1):
        with engine.begin() as conn:
            conn.execute(insert(table), batch)
        inserted = min(batch_index * batch_size, total)
        print_progress(f"{label}: inserted {inserted}/{total}")


def insert_returning_batches(
    engine: Engine,
    table: Table,
    rows: list[dict[str, object]],
    return_cols: Sequence[ColumnElement],
    options: BatchOptions,
) -> list[dict[str, object]]:
    """Insert rows and return selected columns for each batch."""
    total = len(rows)
    results: list[dict[str, object]] = []
    if total == 0:
        print_progress(f"{options.label}: nothing to insert")
        return results
    for batch_index, batch in enumerate(chunked(rows, options.batch_size), start=1):
        with engine.begin() as conn:
            result = conn.execute(insert(table).returning(*return_cols), batch)
            results.extend(dict(row) for row in result.mappings().all())
        inserted = min(batch_index * options.batch_size, total)
        print_progress(f"{options.label}: inserted {inserted}/{total}")
    return results


def compute_set_hash(pairs: list[tuple[int, int]]) -> str:
    """Compute a stable hash for a dimension set."""
    payload = ",".join(f"{dimension_id}:{value_id}" for dimension_id, value_id in pairs)
    return hashlib.sha256(payload.encode("ascii")).hexdigest()


def grain_to_delta(grain: str) -> timedelta:
    """Convert a grain string to a timedelta."""
    normalized = grain.strip().lower()
    if normalized == "hour":
        return timedelta(hours=1)
    if normalized == "week":
        return timedelta(weeks=1)
    if normalized == "month":
        return timedelta(days=30)
    return timedelta(days=1)


def build_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Seed metrics schema with Faker-generated data in batches.",
    )
    parser.add_argument("--metric-count", type=int, default=MIN_METRICS)
    parser.add_argument("--dimension-count", type=int, default=MIN_DIMENSIONS)
    parser.add_argument("--values-per-dimension", type=int, default=MIN_VALUES_PER_DIM)
    parser.add_argument("--sets-count", type=int, default=0)
    parser.add_argument("--observations-per-metric", type=int, default=MIN_OBS_PER_METRIC)
    parser.add_argument("--grain", type=str, default="day")
    parser.add_argument("--meta-batch-size", type=int, default=500)
    parser.add_argument("--obs-batch-size", type=int, default=5_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--key-prefix", type=str, default="seed")
    return parser


def enforce_minimums(args: argparse.Namespace) -> None:
    """Ensure CLI arguments meet the minimum data requirements."""
    if args.metric_count < MIN_METRICS:
        print_progress(
            f"metric-count increased from {args.metric_count} to {MIN_METRICS} (minimum)",
        )
        args.metric_count = MIN_METRICS
    if args.dimension_count < MIN_DIMENSIONS:
        print_progress(
            f"dimension-count increased from {args.dimension_count} to {MIN_DIMENSIONS} (minimum)",
        )
        args.dimension_count = MIN_DIMENSIONS
    if args.values_per_dimension < MIN_VALUES_PER_DIM:
        print_progress(
            f"values-per-dimension increased from {args.values_per_dimension} "
            f"to {MIN_VALUES_PER_DIM} (minimum)",
        )
        args.values_per_dimension = MIN_VALUES_PER_DIM
    if args.observations_per_metric < MIN_OBS_PER_METRIC:
        print_progress(
            f"observations-per-metric increased from {args.observations_per_metric} "
            f"to {MIN_OBS_PER_METRIC} (minimum)",
        )
        args.observations_per_metric = MIN_OBS_PER_METRIC
    if args.sets_count <= 0:
        args.sets_count = args.metric_count


def build_metric_rows(
    faker: Faker,
    count: int,
    key_prefix: str,
) -> list[dict[str, object]]:
    """Build metric definition rows with realistic attributes."""
    metric_types = ["count", "ratio", "sum", "avg", "rate"]
    units = ["count", "percent", "usd", "seconds", "ms"]
    directionality = ["higher", "lower", "neutral"]
    aggregations = ["sum", "avg", "min", "max", "count"]
    rows: list[dict[str, object]] = []
    for index in range(count):
        word = slugify(faker.word(), 32)
        metric_key = slugify(f"{key_prefix}_metric_{index:04d}_{word}", 128)
        metric_name = truncate(faker.sentence(nb_words=4).rstrip("."), 256)
        metric_description = truncate(faker.sentence(nb_words=12), 2048)
        rows.append(
            {
                "metric_key": metric_key,
                "metric_name": metric_name,
                "metric_description": metric_description,
                "metric_type": faker.random_element(metric_types),
                "unit": faker.random_element(units),
                "directionality": faker.random_element(directionality),
                "aggregation": faker.random_element(aggregations),
            },
        )
    return rows


def build_dimension_rows(
    faker: Faker,
    count: int,
    key_prefix: str,
) -> list[dict[str, object]]:
    """Build dimension definition rows."""
    rows: list[dict[str, object]] = []
    for index in range(count):
        word = slugify(faker.word(), 32)
        dimension_key = slugify(f"{key_prefix}_dimension_{index:03d}_{word}", 128)
        dimension_name = truncate(faker.sentence(nb_words=3).rstrip("."), 256)
        dimension_description = truncate(faker.sentence(nb_words=10), 2048)
        rows.append(
            {
                "dimension_key": dimension_key,
                "dimension_name": dimension_name,
                "dimension_description": dimension_description,
                "value_type": "string",
            },
        )
    return rows


def build_dimension_value_rows(
    faker: Faker,
    dimension_ids: list[int],
    values_per_dimension: int,
    dimension_keys: dict[int, str],
) -> list[dict[str, object]]:
    """Build dimension value rows for each dimension."""
    rows: list[dict[str, object]] = []
    for dimension_id in dimension_ids:
        dimension_key = dimension_keys[dimension_id]
        for index in range(values_per_dimension):
            word = slugify(faker.word(), 48)
            value = truncate(f"{dimension_key}_{index:02d}_{word}", 256)
            rows.append({"dimension_id": dimension_id, "value": value})
    return rows


def build_dimension_sets(
    faker: Faker,
    values_by_dimension: dict[int, list[int]],
    sets_count: int,
) -> list[dict[str, object]]:
    """Build randomized dimension sets."""
    dimension_ids = sorted(values_by_dimension.keys())
    seen_hashes: set[str] = set()
    sets: list[dict[str, object]] = []
    attempts = 0
    max_attempts = sets_count * 20
    while len(sets) < sets_count:
        pairs: list[tuple[int, int]] = []
        for dimension_id in dimension_ids:
            value_id = faker.random_element(values_by_dimension[dimension_id])
            pairs.append((dimension_id, value_id))
        set_hash = compute_set_hash(pairs)
        if set_hash in seen_hashes:
            attempts += 1
            if attempts > max_attempts:
                raise RuntimeError(DUPLICATE_SET_HASH_ERROR)
            continue
        seen_hashes.add(set_hash)
        sets.append({"set_hash": set_hash, "pairs": pairs})
    return sets


def insert_observations(
    engine: Engine,
    series_ids: list[int],
    faker: Faker,
    config: ObservationInsertConfig,
) -> None:
    """Insert observation rows for each metric series."""
    total = len(series_ids) * config.observations_per_metric
    if total == 0:
        print_progress("observations: nothing to insert")
        return
    delta = grain_to_delta(config.grain)
    base_start = datetime.now(UTC) - (delta * config.observations_per_metric)
    batch: list[dict[str, object]] = []
    inserted = 0
    print_progress(f"observations: generating {total} rows")
    for series_id in series_ids:
        for offset in range(config.observations_per_metric):
            start_ts = base_start + (delta * offset)
            end_ts = start_ts + delta
            batch.append(
                {
                    "series_id": series_id,
                    "time_start_ts": start_ts,
                    "time_end_ts": end_ts,
                    "value_num": faker.pyfloat(min_value=0, max_value=1000, right_digits=4),
                    "sample_size": faker.pyint(min_value=10, max_value=10_000),
                    "is_estimated": faker.boolean(chance_of_getting_true=10),
                },
            )
            if len(batch) >= config.batch_size:
                with engine.begin() as conn:
                    conn.execute(insert(MetricObservation.__table__), batch)
                inserted += len(batch)
                print_progress(f"observations: inserted {inserted}/{total}")
                batch.clear()
    if batch:
        with engine.begin() as conn:
            conn.execute(insert(MetricObservation.__table__), batch)
        inserted += len(batch)
        print_progress(f"observations: inserted {inserted}/{total}")


def main() -> int:
    """Run the seed workflow."""
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    args = build_parser().parse_args()
    enforce_minimums(args)

    url = build_database_url()
    if not url:
        logger.error("Missing DATABASE_URL or PG_* environment values.")
        return 1

    engine = create_engine(url, pool_pre_ping=True)
    faker = Faker("en_US")
    faker.seed_instance(args.seed)

    print_progress("Building metrics...")
    metric_rows = build_metric_rows(faker, args.metric_count, args.key_prefix)
    metric_results = insert_returning_batches(
        engine,
        MetricDefinition.__table__,
        metric_rows,
        [MetricDefinition.__table__.c.metric_id, MetricDefinition.__table__.c.metric_key],
        BatchOptions(batch_size=args.meta_batch_size, label="metrics"),
    )
    metric_ids = [int(row["metric_id"]) for row in metric_results]

    print_progress("Building dimensions...")
    dimension_rows = build_dimension_rows(faker, args.dimension_count, args.key_prefix)
    dimension_results = insert_returning_batches(
        engine,
        DimensionDefinition.__table__,
        dimension_rows,
        [
            DimensionDefinition.__table__.c.dimension_id,
            DimensionDefinition.__table__.c.dimension_key,
        ],
        BatchOptions(batch_size=args.meta_batch_size, label="dimensions"),
    )
    dimension_ids = [int(row["dimension_id"]) for row in dimension_results]
    dimension_keys = {
        int(row["dimension_id"]): str(row["dimension_key"])
        for row in dimension_results
    }

    print_progress("Building dimension values...")
    dimension_value_rows = build_dimension_value_rows(
        faker,
        dimension_ids,
        args.values_per_dimension,
        dimension_keys,
    )
    dimension_value_results = insert_returning_batches(
        engine,
        DimensionValue.__table__,
        dimension_value_rows,
        [
            DimensionValue.__table__.c.value_id,
            DimensionValue.__table__.c.dimension_id,
        ],
        BatchOptions(batch_size=args.meta_batch_size, label="dimension values"),
    )
    values_by_dimension: dict[int, list[int]] = {dimension_id: [] for dimension_id in dimension_ids}
    for row in dimension_value_results:
        dimension_id = int(row["dimension_id"])
        value_id = int(row["value_id"])
        values_by_dimension[dimension_id].append(value_id)

    print_progress("Building dimension sets...")
    dimension_sets = build_dimension_sets(faker, values_by_dimension, args.sets_count)
    dimension_set_rows = [{"set_hash": spec["set_hash"]} for spec in dimension_sets]
    dimension_set_results = insert_returning_batches(
        engine,
        DimensionSet.__table__,
        dimension_set_rows,
        [DimensionSet.__table__.c.set_id, DimensionSet.__table__.c.set_hash],
        BatchOptions(batch_size=args.meta_batch_size, label="dimension sets"),
    )
    set_id_by_hash = {
        str(row["set_hash"]): int(row["set_id"])
        for row in dimension_set_results
    }

    print_progress("Building dimension set values...")
    dimension_set_value_rows: list[dict[str, object]] = []
    for spec in dimension_sets:
        set_id = set_id_by_hash[spec["set_hash"]]
        for dimension_id, value_id in spec["pairs"]:
            dimension_set_value_rows.append(
                {
                    "set_id": set_id,
                    "dimension_id": dimension_id,
                    "value_id": value_id,
                },
            )
    insert_batches(
        engine,
        DimensionSetValue.__table__,
        dimension_set_value_rows,
        args.meta_batch_size,
        "dimension set values",
    )

    print_progress("Building metric series...")
    set_ids = [int(row["set_id"]) for row in dimension_set_results]
    series_rows = [
        {
            "metric_id": metric_id,
            "grain": args.grain,
            "set_id": faker.random_element(set_ids),
        }
        for metric_id in metric_ids
    ]
    series_results = insert_returning_batches(
        engine,
        MetricSeries.__table__,
        series_rows,
        [MetricSeries.__table__.c.series_id, MetricSeries.__table__.c.metric_id],
        BatchOptions(batch_size=args.meta_batch_size, label="metric series"),
    )
    series_ids = [int(row["series_id"]) for row in series_results]

    print_progress("Building observations...")
    insert_observations(
        engine,
        series_ids,
        faker,
        ObservationInsertConfig(
            observations_per_metric=args.observations_per_metric,
            batch_size=args.obs_batch_size,
            grain=args.grain,
        ),
    )

    print_progress("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
