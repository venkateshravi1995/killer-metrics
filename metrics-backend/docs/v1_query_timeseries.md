# POST /v1/query/timeseries

## Summary
Fetch time series for one or more metrics over a range, optionally grouped by dimensions.

## Input
JSON body:
```json
{
  "metric_keys": ["orders", "revenue"],
  "grain": "day",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-31T00:00:00Z",
  "group_by": ["country", "product"],
  "filters": [
    {"dimension_key": "channel", "values": ["email", "paid"]}
  ]
}
```

## Output
```json
{
  "metric_keys": ["orders", "revenue"],
  "grain": "day",
  "series": [
    {
      "metric_key": "orders",
      "dimensions": {"country": "US", "product": "widget"},
      "points": [
        {"time_start_ts": "2024-01-01T00:00:00Z", "value": 123.0},
        {"time_start_ts": "2024-01-02T00:00:00Z", "value": 145.0}
      ]
    }
  ]
}
```

## Operations
- Resolve `metric_id` and aggregation rule for each `metric_key`.
- Query `metrics.metric_observation` for requested metrics, grain, and time range.
- Apply dimension filters by joining `metrics.metric_observation_dim` per filter.
- Apply `group_by` by joining `metric_observation_dim` per dimension and grouping.
- Aggregate values per metric, time bucket, and group.

## Agent instructions
- Use SQLAlchemy Core; avoid ORM.
- Apply time range on `metric_observation.time_start_ts` and `grain` on the fact table
  to leverage the sort key `(metric_id, time_start_ts)`.
- For dimension filters, join only when provided; use a filtered join per dimension.
- For multiple aggregation rules, group metrics by aggregation type to avoid per-metric scans.
- Return ordered results by `time_start_ts` within each series.
