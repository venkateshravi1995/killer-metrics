# Visuals Backend Tutorials

## Run locally
```bash
uvicorn app.main:app --reload --port 8100
```

## Create a dashboard
1. `POST /v1/dashboards` with name, description, and `config` (including tiles).
2. Use the returned `id` for subsequent reads and draft operations.
