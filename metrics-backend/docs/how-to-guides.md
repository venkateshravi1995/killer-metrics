# Metrics Backend How-to Guides

## Query a metric time series
1. `POST /v1/query/timeseries` with metric keys, grain, and a time range.
2. Optionally include `group_by` dimensions and `filters`.
3. Read the `series` array in the response.

## Fetch available dimensions for a filter
1. `GET /v1/dimensions/{dimension_key}/values`.
2. Optionally include `metric_key`, `start_time`, and `end_time` to scope values.

## Check service health
- `GET /health` for basic liveness.
- `GET /health/db` to validate database connectivity.
