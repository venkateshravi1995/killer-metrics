# GET /v1/query/latest

## Summary
Return the latest available value for a metric, optionally sliced by dimensions.

## Input
Query params:
- `metric_key`: string; required
- `grain`: string; required (hour|day|week|month)
- `dimensions`: repeated `dimension_key:dimension_value` pairs; optional

## Output
```json
{
  "metric_key": "orders",
  "grain": "day",
  "time_start_ts": "2024-01-31T00:00:00Z",
  "value": 201.0
}
```

## Operations
- Resolve `metric_id` from `metrics.metric_definition`.
- Query `metrics.metric_observation` filtered by `metric_id` and `grain`.
- Apply dimension filters via `metrics.metric_observation_dim`.
- Order by `time_start_ts` desc and take the first row.

## Agent instructions
- Use SQLAlchemy Core; avoid ORM.
- Push filters on `metric_id` and `grain` before ordering.
- Use `order_by(time_start_ts.desc()).limit(1)` to minimize scan.
- Only join `metric_observation_dim` when dimension filters are provided.
