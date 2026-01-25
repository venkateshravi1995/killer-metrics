# GET /v1/dimensions

## Summary
List active dimensions from the catalog with metadata.

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
      "dimension_key": "country",
      "dimension_name": "Country",
      "dimension_description": "ISO country code",
      "value_type": "string",
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
- Read from `metrics.dimension_definition`.
- Filter by `is_active` if provided.
- Sort by `dimension_key` for stable pagination.

## Agent instructions
- Use SQLAlchemy Core `select()` against `metrics.dimension_definition` only.
- Avoid joins; table is `DISTSTYLE ALL` and small, but joins are unnecessary.
- Apply `limit/offset` after filters and ordering.
