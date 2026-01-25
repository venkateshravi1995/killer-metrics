# POST /v1/query/topk

## Summary
Return the top N dimension groups by aggregated value for a time window.

## Input
JSON body:
```json
{
  "metric_key": "revenue",
  "grain": "day",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-31T00:00:00Z",
  "group_by": ["country"],
  "filters": [
    {"dimension_key": "channel", "values": ["email", "paid"]}
  ],
  "k": 10,
  "order": "desc"
}
```

## Output
```json
{
  "metric_key": "revenue",
  "grain": "day",
  "items": [
    {"dimensions": {"country": "US"}, "value": 50123.0},
    {"dimensions": {"country": "GB"}, "value": 20111.0}
  ]
}
```

## Operations
- Resolve `metric_id` from `metrics.metric_definition`.
- Filter `metrics.metric_observation` by `metric_id`, `grain`, and time range.
- Apply dimension filters using `metrics.metric_observation_dim` joins.
- Join `metric_observation_dim` for `group_by` dimensions and aggregate by those values.
- Order by aggregated value and return top K.

## Agent instructions
- Use SQLAlchemy Core; avoid ORM.
- Use the fact table scan with `metric_id` and time range predicates for pruning.
- Keep K small and apply `order_by(agg.desc())` then `limit(k)`.
- For multiple group_by dimensions, join each as a separate alias.
