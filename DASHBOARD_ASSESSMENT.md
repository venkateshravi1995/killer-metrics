# Dashboard Assessment

Date: 2026-01-27

## Scope
This assessment covers the dashboard builder frontend (`frontend/`), the metrics query API (`metrics-backend/`), and the dashboard CRUD API (`visuals-backend/`). It focuses on architecture, current state, code quality, performance/speed opportunities, and inconsistencies/bugs/vulnerabilities.

## Architecture Overview

### High-level topology
- **Frontend**: Next.js app rendering the dashboard builder UI and tiles. Core state and data fetching live in `frontend/components/dashboard/*`.
- **Metrics backend**: FastAPI service for metric catalog, dimensions, and query endpoints. Core routing in `metrics-backend/app/api/routes/v1`.
- **Visuals backend**: FastAPI service for dashboard CRUD + draft workflows. Core routing in `visuals-backend/app/api/routes/v1`.

### Data flow (end-to-end)
1. **App bootstrap**: The UI loads dashboards, metrics, and dimensions, then normalizes tiles and layouts (`frontend/components/dashboard/builder/state.ts`).
2. **Tile configuration**: UI edits tile config + layout and persists to draft endpoints (`frontend/components/dashboard/tiles/configurator/default.tsx`, `frontend/components/dashboard/api.ts`).
3. **Tile data**: Each tile resolves time range (availability) and fetches data (timeseries/aggregate/latest) from metrics backend (`frontend/components/dashboard/use-tile-data.ts`).
4. **Draft lifecycle**: Draft tiles + layout saved through visuals backend and committed to publish (`visuals-backend/app/api/routes/v1/dashboards.py`).

### Storage layout
- **Metrics DB**: Normalized metrics schema (definitions, dimensions, series, observations) in `metrics-backend/app/db/schema.py` and migrations.
- **Dashboards DB**: `Dashboard` and `DashboardTile` rows with JSON config in `visuals-backend/app/db/schema.py`.

## Current State (What’s Present)

### Frontend
- Dashboard builder with grid layout, configurator, and edit/draft behavior (`frontend/components/dashboard/builder/state.ts`).
- Tile registry + definitions for line/area/bar/donut/table/kpi (`frontend/components/dashboard/tiles/*`).
- Tile data loader with availability resolution and aggregation handling (`frontend/components/dashboard/use-tile-data.ts`).

### Metrics backend
- Metric catalog, dimension catalog, dimension value search (`metrics-backend/app/api/routes/v1/metrics.py`, `dimensions.py`).
- Query endpoints: timeseries, aggregate, latest, top-k (`metrics-backend/app/api/routes/v1/queries.py`).
- Auth gate for v1 router (`metrics-backend/app/api/routes/v1/router.py`).

### Visuals backend
- Dashboard CRUD and draft lifecycle with per-tile updates and layout updates (`visuals-backend/app/api/routes/v1/dashboards.py`).

### Tooling & tests
- No test suite detected in repo (no unit/integration tests or CI config).

## Code Quality Strengths
- Clear service separation and routing boundaries between metrics and visuals backends.
- Strong type usage in TS models and backend Pydantic schemas.
- Consistent query helper utilities (grain normalization, dimension resolution).
- Tile definitions centralized and discoverable via registry.

## Issues, Inconsistencies, and Bugs

### High impact
1. **Potential multi-tenant data exposure in metrics backend**
   - Metrics endpoints require auth but do not scope queries by `client_id` or `user_id`. Any valid token can query all metrics if data is shared in a single DB.
   - Locations: `metrics-backend/app/api/routes/v1/router.py`, `metrics-backend/app/api/routes/v1/queries.py`, `metrics-backend/app/api/routes/v1/metrics.py`.

### Medium impact
2. **Latest endpoint reports requested grain but returns source-grain timestamps**
   - `get_latest` returns `grain=requested_grain` but `time_start_ts` is taken directly from the source series grain without bucketing. This can mislead KPI tiles and any consumer expecting a bucketed timestamp.
   - Location: `metrics-backend/app/api/routes/v1/queries.py`.

3. **Mobile breakpoint layout sizing uses desktop column count**
   - `resolveLayoutCols` returns `gridCols.lg` for `xs`/`xxs`. This conflicts with grid columns (`gridCols.xs = 1`) and can cause layouts to be sized or packed incorrectly on small screens.
   - Location: `frontend/components/dashboard/builder/state.ts`.

### Low impact / consistency
4. **Visuals backend DB URL builder doesn’t URL-encode credentials**
   - `build_database_url()` concatenates user/password directly, unlike metrics backend which `quote_plus()` encodes. Special characters in passwords can break connections.
   - Location: `visuals-backend/app/core/config.py`.

5. **Tile payloads allow arbitrary fields without validation**
   - `TilePayload` is `extra="allow"` and the config JSON is stored as-is. This is flexible but can cause runtime errors in the frontend if invalid fields are stored.
   - Location: `visuals-backend/app/schemas/dashboards.py`.

## Security & Privacy Observations
- **Cache-Control for catalog endpoints is `public`** even though endpoints are auth-gated. If the service is multi-tenant, shared proxies could cache and replay data across users.
  - Location: `metrics-backend/app/api/routes/v1/utils.py`.
- **Auth parsing uses JWKS with caching** (good), but **client_id is derived from user_id** and not used to scope queries.
  - Locations: `metrics-backend/app/core/auth.py`, `visuals-backend/app/core/auth.py`.

## Performance & Speed Optimization Opportunities

### Frontend
1. **Deduplicate tile data requests**
   - Tiles with identical `(metricKeys, grain, groupBy, filters, range)` each make separate API calls. Consider a client-side cache keyed by these inputs.
   - Location: `frontend/components/dashboard/use-tile-data.ts`.

2. **Reduce draft update chatter**
   - Layout updates send the full list on each interaction (add/duplicate/remove/commit). Debounce or send per-tile deltas to reduce writes.
   - Location: `frontend/components/dashboard/builder/state.ts`.

3. **Availability requests are per-tile**
   - Availability is fetched individually for each tile. Consider caching availability per `(metricKey, grain, filters)`.
   - Location: `frontend/components/dashboard/use-tile-data.ts`.

### Metrics backend
1. **Cache metric/dimension ID resolution**
   - `resolve_metric_ids`, `resolve_dimension_ids`, and `resolve_metric_source_grains` hit DB every request; TTL caching would reduce load.
   - Location: `metrics-backend/app/db/helpers.py`.

2. **Consolidate aggregation queries**
   - Queries are split by aggregation type and sometimes by source grain; could be reduced with CASE/filtered aggregates depending on DB size and planner.
   - Location: `metrics-backend/app/api/routes/v1/queries.py`.

### Visuals backend
1. **Bulk tile upserts**
   - Update and commit workflows delete and reinsert all tiles. Consider diffing and updating only changed tiles for large dashboards.
   - Location: `visuals-backend/app/api/routes/v1/dashboards.py`.

## Reliability & Testing Gaps
- No automated tests for:
  - Metrics queries (timeseries/aggregate/latest/topk).
  - Draft lifecycle in visuals backend.
  - Frontend tile data resolver and config normalization.
- No visible CI or pre-commit verification in repo.

## Recommendations (Prioritized)
1. **Decide tenant model and enforce scoping** in metrics backend or explicitly document that metrics are global.
2. **Fix latest grain consistency** by bucketing `time_start_ts` to requested grain or returning `grain=source_grain` explicitly.
3. **Correct mobile layout sizing** by using `gridCols.xs/xxs` in `resolveLayoutCols` or clamping widths during render only.
4. **Harden catalog caching** by switching `Cache-Control` to `private` (or vary by auth) if data is user/tenant-specific.
5. **Add minimal schema validation for tile payloads** to avoid runtime errors from invalid config.
6. **Add test coverage** around query endpoints and draft lifecycle.

## Key File References
- `frontend/components/dashboard/use-tile-data.ts`
- `frontend/components/dashboard/builder/state.ts`
- `frontend/components/dashboard/tiles/configurator/default.tsx`
- `metrics-backend/app/api/routes/v1/queries.py`
- `metrics-backend/app/api/routes/v1/metrics.py`
- `metrics-backend/app/api/routes/v1/utils.py`
- `metrics-backend/app/db/helpers.py`
- `visuals-backend/app/api/routes/v1/dashboards.py`
- `visuals-backend/app/core/config.py`
- `visuals-backend/app/schemas/dashboards.py`
