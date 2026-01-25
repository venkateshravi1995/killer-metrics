# GET /v1/dimensions/{dimension_key}

## Summary
Fetch a single dimension definition by key.

## Input
Path params:
- `dimension_key`: string; required

## Output
```json
{
  "dimension_key": "country",
  "dimension_name": "Country",
  "dimension_description": "ISO country code",
  "value_type": "string",
  "is_active": true,
  "created_ts": "2024-01-01T00:00:00Z",
  "updated_ts": "2024-01-10T00:00:00Z"
}
```

## Operations
- Read from `metrics.dimension_definition` where `dimension_key = :dimension_key`.

## Agent instructions
- Use SQLAlchemy Core and `where()` on `dimension_key`.
- Return 404 if not found.
