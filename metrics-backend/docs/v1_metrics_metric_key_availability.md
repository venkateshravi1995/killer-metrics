# GET /v1/metrics/{metric_key}/availability

## Summary
Return the min/max available time range for a metric at a given grain, with optional
dimension filters.

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
  "min_time_start_ts": "2023-01-01T00:00:00Z",
  "max_time_start_ts": "2024-01-31T00:00:00Z"
}
```

## Operations
- Resolve `metric_id` from `metrics.metric_definition`.
- Filter `metrics.metric_observation` by `metric_id` and `grain`.
- Apply dimension filters via `metrics.metric_observation_dim` when provided.
- Compute `min(time_start_ts)` and `max(time_start_ts)`.

## Agent instructions
- Use SQLAlchemy Core; avoid ORM.
- Use aggregate functions on `time_start_ts` with a single pass scan.
- Only join dimension tables when dimension filters are provided.
