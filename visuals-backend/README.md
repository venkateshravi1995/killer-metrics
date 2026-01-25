# Visuals Backend

FastAPI service for dashboard CRUD backed by Postgres.

## Environment
- `DASHBOARDING_DATABASE_URL` (preferred, use `postgresql+psycopg://`)
- `DASHBOARDING_PG_HOST` / `DASHBOARDING_PG_DATABASE` / `DASHBOARDING_PG_USER` / `DASHBOARDING_PG_PASSWORD` / `DASHBOARDING_PG_PORT`
- `PG_HOST` / `PG_DATABASE` / `PG_USER` / `PG_PASSWORD` / `PG_PORT` (fallbacks)
- `CORS_ORIGINS` (comma-separated, default `*`)
- `CLIENT_ID_HEADER` (default: `X-Client-Id`)
- `USER_ID_HEADER` (default: `X-User-Id`)

## Run locally
```
uvicorn app.main:app --reload --port 8100
```

## API
- `POST /v1/dashboards`
- `GET /v1/dashboards`
- `GET /v1/dashboards/{dashboard_id}` (returns user draft if present; response includes `is_draft`)
- `PUT /v1/dashboards/{dashboard_id}`
- `DELETE /v1/dashboards/{dashboard_id}`
- `POST /v1/dashboards/{dashboard_id}/draft/tiles`
- `PUT /v1/dashboards/{dashboard_id}/draft/tiles/{tile_id}`
- `DELETE /v1/dashboards/{dashboard_id}/draft/tiles/{tile_id}`
- `PUT /v1/dashboards/{dashboard_id}/draft/layout`
- `PATCH /v1/dashboards/{dashboard_id}/draft/metadata`
- `POST /v1/dashboards/{dashboard_id}/draft/commit`
- `DELETE /v1/dashboards/{dashboard_id}/draft`
- `GET /health`
