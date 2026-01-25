# Metrics Backend Reference

## Environment
- `DATABASE_URL` (preferred, use `postgresql+psycopg://`)
- Or `PG_HOST`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, `PG_PORT`

## Endpoints

### Health

**GET `/health`**
- **Summary**: Basic liveness check.
- **Input fields**: None.
- **Operations**: Returns a static status.
- **Output fields**:
  - `status`: String status (`ok`).

**GET `/health/db`**
- **Summary**: Database connectivity check.
- **Input fields**: None.
- **Operations**: Executes a count query against `metric_definition`.
- **Output fields**:
  - `status`: String status (`ok`).
  - `db`: Count of metrics returned by the database.

### Metrics catalog

**GET `/v1/metrics`**
- **Summary**: List metric definitions.
- **Input fields** (query):
  - `is_active` (bool, default `true`): Filter active metrics.
  - `limit` (int, default `500`): Page size (1–5000).
  - `offset` (int, default `0`): Pagination offset.
- **Operations**: Reads from `metric_definition`, applies filters and pagination.
- **Output fields**:
  - `items`: Array of metric definitions (see “Metric definition fields”).
  - `limit`: Page size.
  - `offset`: Pagination offset.

**GET `/v1/metrics/{metric_key}`**
- **Summary**: Fetch a single metric definition.
- **Input fields** (path):
  - `metric_key`: Metric identifier.
- **Operations**: Looks up a metric by key.
- **Output fields**: Metric definition fields.

**GET `/v1/metrics/{metric_key}/availability`**
- **Summary**: Return min/max available time range for a metric.
- **Input fields**:
  - `metric_key` (path)
  - `grain` (query, required)
  - `dimensions` (query, repeated `key:value` pairs)
- **Operations**: Filters observations by metric, grain, and dimensions, then computes min/max timestamps.
- **Output fields**:
  - `metric_key`
  - `grain`
  - `min_time_start_ts`
  - `max_time_start_ts`

**GET `/v1/metrics/{metric_key}/freshness`**
- **Summary**: Return most recent observation timestamps.
- **Input fields**:
  - `metric_key` (path)
  - `grain` (query, required)
  - `dimensions` (query, repeated `key:value` pairs)
- **Operations**: Filters observations and returns the latest time/ingest timestamps.
- **Output fields**:
  - `metric_key`
  - `grain`
  - `latest_time_start_ts`
  - `latest_ingested_ts`

### Dimensions catalog

**GET `/v1/dimensions`**
- **Summary**: List dimension definitions.
- **Input fields** (query):
  - `is_active` (bool, default `true`)
  - `limit` (int, default `500`)
  - `offset` (int, default `0`)
- **Operations**: Reads from `dimension_definition`, applies filters and pagination.
- **Output fields**:
  - `items`: Array of dimension definitions (see “Dimension definition fields”).
  - `limit`: Page size.
  - `offset`: Pagination offset.

**GET `/v1/dimensions/{dimension_key}`**
- **Summary**: Fetch a single dimension definition.
- **Input fields** (path):
  - `dimension_key`: Dimension identifier.
- **Operations**: Looks up a dimension by key.
- **Output fields**: Dimension definition fields.

**GET `/v1/dimensions/{dimension_key}/values`**
- **Summary**: List distinct dimension values, optionally scoped by metric/time.
- **Input fields**:
  - `dimension_key` (path)
  - `metric_key` (query, optional)
  - `start_time` (query, optional, ISO datetime)
  - `end_time` (query, optional, ISO datetime)
  - `limit` (query, default `500`)
  - `offset` (query, default `0`)
- **Operations**: Queries `metric_observation_dim` with optional joins to observations.
- **Output fields**:
  - `dimension_key`
  - `items`: Array of distinct values (strings).
  - `limit`
  - `offset`

### Query APIs

**POST `/v1/query/timeseries`**
- **Summary**: Fetch time-series data for one or more metrics.
- **Input fields** (body, `TimeseriesQuery`):
  - `metric_keys` (list[string], required): Metric keys to query.
  - `grain` (string, required): Time grain.
  - `start_time` / `end_time` (datetime, required): Time range.
  - `group_by` (list[string], optional): Dimension keys.
  - `filters` (list[DimensionFilter], optional): Dimension filters.
- **Operations**: Resolves metric IDs, groups by aggregation, applies filters/grouping, returns series.
- **Output fields**:
  - `metric_keys`
  - `grain`
  - `series`: Array of series objects:
    - `metric_key`
    - `dimensions` (object)
    - `points`: Array of `{ time_start_ts, value }`

**GET `/v1/query/latest`**
- **Summary**: Fetch the most recent observation for a metric.
- **Input fields** (query):
  - `metric_key` (required)
  - `grain` (required)
  - `dimensions` (optional, repeated `key:value` pairs)
- **Operations**: Filters observations and returns the latest by time.
- **Output fields**:
  - `metric_key`
  - `grain`
  - `time_start_ts`
  - `value`

**POST `/v1/query/aggregate`**
- **Summary**: Aggregate metrics over a time range.
- **Input fields** (body, `AggregateQuery`):
  - `metric_keys` (list[string], required)
  - `grain` (string, required)
  - `start_time` / `end_time` (datetime, required)
  - `group_by` (list[string], optional)
  - `filters` (list[DimensionFilter], optional)
- **Operations**: Aggregates metric values grouped by dimensions.
- **Output fields**:
  - `metric_keys`
  - `grain`
  - `groups`: Array of `{ metric_key, dimensions, value }`

**POST `/v1/query/topk`**
- **Summary**: Return the top (or bottom) K dimension groups for a metric.
- **Input fields** (body, `TopKQuery`):
  - `metric_key` (string, required)
  - `grain` (string, required)
  - `start_time` / `end_time` (datetime, required)
  - `group_by` (list[string], optional)
  - `filters` (list[DimensionFilter], optional)
  - `k` (int, default `10`)
  - `order` (`asc` or `desc`, default `desc`)
- **Operations**: Aggregates then orders by value, returning top/bottom K.
- **Output fields**:
  - `metric_key`
  - `grain`
  - `items`: Array of `{ dimensions, value }`

## Schema reference

**DimensionFilter**
- `dimension_key`: Dimension identifier.
- `values`: List of allowed values.

**Metric definition fields**
- `metric_id`, `metric_key`, `metric_name`, `metric_description`, `metric_type`, `unit`,
  `directionality`, `aggregation`, `is_active`, `created_ts`, `updated_ts`.

**Dimension definition fields**
- `dimension_id`, `dimension_key`, `dimension_name`, `dimension_description`,
  `value_type`, `is_active`, `created_ts`, `updated_ts`.
