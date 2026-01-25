# Visuals Backend Reference

## Headers
- `X-Client-Id` (default header name, configurable by `CLIENT_ID_HEADER`)
- `X-User-Id` (default header name, configurable by `USER_ID_HEADER`)

These headers scope dashboards and drafts. If absent, a fallback value is used.

## Environment
- `DASHBOARDING_DATABASE_URL` (preferred, use `postgresql+psycopg://`)
- `DASHBOARDING_PG_HOST`, `DASHBOARDING_PG_DATABASE`, `DASHBOARDING_PG_USER`, `DASHBOARDING_PG_PASSWORD`, `DASHBOARDING_PG_PORT`
- `PG_HOST`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, `PG_PORT` (fallbacks)
- `CORS_ORIGINS` (comma-separated, default `*`)
- `CLIENT_ID_HEADER` (default `X-Client-Id`)
- `USER_ID_HEADER` (default `X-User-Id`)

## Endpoints

### Health

**GET `/health`**
- **Summary**: Basic liveness check.
- **Input fields**: None.
- **Operations**: Returns a static status.
- **Output fields**:
  - `status`: String status (`ok`).

### Dashboards

**POST `/v1/dashboards`**
- **Summary**: Create a new dashboard.
- **Input fields**:
  - Headers: `X-Client-Id`.
  - Body (`DashboardCreate`):
    - `name` (string, required)
    - `description` (string, optional)
    - `config` (object, required; typically `{ tiles: [...] }`)
- **Operations**: Inserts a published dashboard and optional tiles.
- **Output fields** (`DashboardOut`):
  - `id`, `client_id`, `name`, `description`, `config`, `created_at`, `updated_at`, `is_draft`.

**GET `/v1/dashboards`**
- **Summary**: List published dashboards.
- **Input fields**:
  - Headers: `X-Client-Id`.
  - Query: `limit` (default `50`, max `200`), `cursor` (optional).
- **Operations**: Returns paginated dashboard summaries with cursor-based pagination.
- **Output fields** (`DashboardList`):
  - `items`: Array of `{ id, name, description, updated_at }`.
  - `limit`
  - `next_cursor`

**GET `/v1/dashboards/{dashboard_id}`**
- **Summary**: Fetch a dashboard; returns draft if one exists for the user.
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`.
- **Operations**: Looks up published dashboard and user draft; returns draft when present.
- **Output fields** (`DashboardOut`):
  - `id`, `client_id`, `name`, `description`, `config`, `created_at`, `updated_at`, `is_draft`.

**PUT `/v1/dashboards/{dashboard_id}`**
- **Summary**: Replace a published dashboard.
- **Input fields**:
  - Headers: `X-Client-Id`.
  - Path: `dashboard_id`.
  - Body (`DashboardUpdate`): `name`, `description`, `config`.
- **Operations**: Updates published dashboard and replaces tiles.
- **Output fields** (`DashboardOut`).

**POST `/v1/dashboards/{dashboard_id}/draft/tiles`**
- **Summary**: Add a tile to the draft (creates draft if needed).
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`.
  - Body (`TilePayload`): `id` plus arbitrary tile config fields.
- **Operations**: Creates or loads a draft, then inserts a tile with the next position.
- **Output fields**: None (204).

**PUT `/v1/dashboards/{dashboard_id}/draft/tiles/{tile_id}`**
- **Summary**: Update a tile in the draft.
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`, `tile_id`.
  - Body (`TilePayload`): `id` must match `tile_id` plus arbitrary fields.
- **Operations**: Updates the draft tile config and timestamps.
- **Output fields**: None (204).

**DELETE `/v1/dashboards/{dashboard_id}/draft/tiles/{tile_id}`**
- **Summary**: Remove a tile from the draft.
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`, `tile_id`.
- **Operations**: Deletes the draft tile after ensuring a draft exists.
- **Output fields**: None (204).

**PUT `/v1/dashboards/{dashboard_id}/draft/layout`**
- **Summary**: Update layout for multiple draft tiles.
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`.
  - Body (`TileLayoutUpdate`):
    - `items`: Array of `{ id, layout }` where `layout` is a `{ x, y, w, h }` object.
- **Operations**: Updates each tile’s layout field in its stored config.
- **Output fields**: None (204).

**PATCH `/v1/dashboards/{dashboard_id}/draft/metadata`**
- **Summary**: Update draft metadata only (name/description).
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`.
  - Body (`DashboardMetadataUpdate`): `name` and/or `description`.
- **Operations**: Updates draft metadata fields and timestamps.
- **Output fields**: None (204).

**POST `/v1/dashboards/{dashboard_id}/draft/commit`**
- **Summary**: Publish a draft.
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`.
- **Operations**: Overwrites published dashboard with draft content and deletes the draft.
- **Output fields** (`DashboardOut`).

**DELETE `/v1/dashboards/{dashboard_id}/draft`**
- **Summary**: Delete a draft for the current user.
- **Input fields**:
  - Headers: `X-Client-Id`, `X-User-Id`.
  - Path: `dashboard_id`.
- **Operations**: Removes the draft if present.
- **Output fields**: None (204).

**DELETE `/v1/dashboards/{dashboard_id}`**
- **Summary**: Delete a published dashboard (and any drafts).
- **Input fields**:
  - Headers: `X-Client-Id`.
  - Path: `dashboard_id`.
- **Operations**: Deletes all dashboard rows for the client and ID.
- **Output fields**: None (204).

## Schema reference

**DashboardCreate / DashboardUpdate**
- `name`: Required string (1–160 chars).
- `description`: Optional string (<= 2048 chars).
- `config`: Arbitrary JSON object (usually `{ tiles: [...] }`).

**DashboardOut**
- `id`, `client_id`, `name`, `description`, `config`, `created_at`, `updated_at`, `is_draft`.

**DashboardList**
- `items`: Array of `DashboardSummary`.
- `limit`
- `next_cursor`

**DashboardSummary**
- `id`, `name`, `description`, `updated_at`.

**DashboardMetadataUpdate**
- `name` (optional)
- `description` (optional)

**TilePayload**
- `id` plus arbitrary tile fields (extra fields allowed).

**TileLayoutUpdate**
- `items`: Array of `{ id, layout }` where `layout` values are integers.
