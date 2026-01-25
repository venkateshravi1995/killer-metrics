# GET /v1/metrics/{metric_key}

## Summary
Fetch a single metric definition by key.

## Input
Path params:
- `metric_key`: string; required

## Output
```json
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
```

## Operations
- Read from `metrics.metric_definition` where `metric_key = :metric_key`.

## Agent instructions
- Use SQLAlchemy Core and `where()` on `metric_key`.
- Return 404 if not found.
