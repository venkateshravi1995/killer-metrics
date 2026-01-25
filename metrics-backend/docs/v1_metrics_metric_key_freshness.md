# GET /v1/metrics/{metric_key}/freshness

## Summary
Return the latest data point time and ingestion time for a metric at a given grain,
optionally filtered by dimensions.

## Input
Path params:
- `metric_key`: string; required

Query params:
- `grain`: string; required (hour|day|week|month)
- `dimensions`: repeated `dimension_key:dimension_value` pairs; optional

## Output
```json
{
  "metric_key": "orders",
  "grain": "day",
  "latest_time_start_ts": "2024-01-31T00:00:00Z",
  "latest_ingested_ts": "2024-02-01T01:23:45Z"
}
```

## Operations
- Resolve `metric_id` from `metrics.metric_definition`.
- Filter `metrics.metric_observation` by `metric_id` and `grain`.
- Apply dimension filters via `metrics.metric_observation_dim` when provided.
- Order by `time_start_ts` desc and select `time_start_ts`, `ingested_ts` for the first row.

## Agent instructions
- Use SQLAlchemy Core; avoid ORM.
- Push `metric_id` and `grain` filters into the base scan.
- Use `order_by(time_start_ts.desc()).limit(1)` for efficiency.
- Only join dimension tables when dimension filters are provided.
