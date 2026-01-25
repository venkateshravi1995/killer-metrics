# API Docs (Read-only)

This folder contains per-endpoint documentation for the read-only metric APIs.
Each endpoint doc includes summary, input, output, operations, and query guidance
against the Postgres schema in `database/schema.sql`.

## Catalog
- GET /v1/metrics -> v1_metrics.md
- GET /v1/metrics/{metric_key} -> v1_metrics_metric_key.md
- GET /v1/dimensions -> v1_dimensions.md
- GET /v1/dimensions/{dimension_key} -> v1_dimensions_dimension_key.md
- GET /v1/dimensions/{dimension_key}/values -> v1_dimensions_dimension_key_values.md

## Queries
- POST /v1/query/timeseries -> v1_query_timeseries.md
- GET /v1/query/latest -> v1_query_latest.md
- POST /v1/query/aggregate -> v1_query_aggregate.md
- POST /v1/query/topk -> v1_query_topk.md

## Availability
- GET /v1/metrics/{metric_key}/availability -> v1_metrics_metric_key_availability.md
- GET /v1/metrics/{metric_key}/freshness -> v1_metrics_metric_key_freshness.md
