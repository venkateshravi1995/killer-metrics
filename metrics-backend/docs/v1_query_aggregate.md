# POST /v1/query/aggregate

## Summary
Aggregate one or more metrics over a time window, optionally grouped by dimensions.

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
  "groups": [
    {
      "metric_key": "orders",
      "dimensions": {"country": "US", "product": "widget"},
      "value": 12345.0
    }
  ]
}
```

## Operations
- Resolve `metric_id` and aggregation rule for each `metric_key`.
- Filter `metrics.metric_observation` by metric ids, grain, and time range.
- Apply dimension filters by joining `metrics.metric_observation_dim` per filter.
- If `group_by` is present, join `metric_observation_dim` per grouped dimension.
- Aggregate using each metric's supported aggregation rule.

## Agent instructions
- Use SQLAlchemy Core; avoid ORM.
- Keep the base scan on `metric_observation` as the driving table.
- For filters, use separate joins per dimension with aliases to keep predicates tight.
- For `group_by`, join only the dimensions requested; select them and add to `group_by`.
- Consider returning `sample_size` aggregated as `sum(sample_size)` when present.
