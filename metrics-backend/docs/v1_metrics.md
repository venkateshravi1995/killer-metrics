# GET /v1/metrics

## Summary
List active metrics from the catalog with basic metadata.

## Input
Query params (optional):
- `is_active`: boolean; default true
- `limit`: int; default 500
- `offset`: int; default 0

## Output
```json
{
  "items": [
    {
      "metric_key": "orders",
      "metric_name": "Orders",
      "metric_description": "Total completed orders",
      "metric_type": "counter",
      "unit": "count",
      "directionality": "higher_is_better",
      "aggregation": "sum",
      "is_active": true,
      "created_ts": "2024-01-01T00:00:00Z",
      "updated_ts": "2024-01-10T00:00:00Z"
    }
  ],
  "limit": 500,
  "offset": 0
}
```

## Operations
- Read from `metrics.metric_definition`.
- Filter by `is_active` if provided.
- Sort by `metric_key` for stable pagination.

## Agent instructions
- Use SQLAlchemy Core `select()` against `metrics.metric_definition` only.
- Avoid joins; table is `DISTSTYLE ALL` and small, but joins are unnecessary.
- Apply `limit/offset` after filters and ordering.
