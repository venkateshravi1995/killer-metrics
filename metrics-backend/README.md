# Metrics Backend

FastAPI service with PostgreSQL using SQLAlchemy + psycopg over TCP.

## Quick start (uv)

```bash
uv venv
source .venv/bin/activate
uv pip install -e .
cp .env.example .env
uvicorn app.main:app --reload
```

## Environment

Set either `DATABASE_URL` (use `postgresql+psycopg://`) or the `PG_*` variables in `.env`.

## Migrations (Alembic)

Run Alembic online:

```bash
cd metrics-backend
alembic upgrade head
```

Alembic uses `psycopg`; install the default dependencies if needed.
