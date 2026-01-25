# GET /v1/dimensions/{dimension_key}/values

## Summary
List distinct values observed for a dimension.

## Input
Path params:
- `dimension_key`: string; required

Query params (optional):
- `metric_key`: string; limit values to a single metric
- `start_time`: ISO-8601 timestamp; optional
- `end_time`: ISO-8601 timestamp; optional
- `limit`: int; default 500
- `offset`: int; default 0

## Output
```json
{
  "dimension_key": "country",
  "items": ["US", "CA", "GB"],
  "limit": 500,
  "offset": 0
}
```

## Operations
- Resolve `dimension_id` from `metrics.dimension_definition`.
- Optional: resolve `metric_id` from `metrics.metric_definition` if `metric_key` given.
- Query distinct `dimension_value` from `metrics.metric_observation_dim` joined to
  `metrics.metric_observation` for time filters and optional metric filter.

## Agent instructions
- Use SQLAlchemy Core; do not use ORM mappings.
- When time filters are present, join `metric_observation_dim` -> `metric_observation`
  on `observation_id`, and apply `time_start_ts` range predicates on the fact table.
- If `metric_key` is provided, filter on `metric_observation.metric_id` after resolving it.
- Select `distinct(dimension_value)` and order by `dimension_value` for stable pagination.
- Apply `limit/offset` after ordering.
