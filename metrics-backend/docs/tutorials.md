# Metrics Backend Tutorials

## Run the service locally (uv)
```bash
uv venv
source .venv/bin/activate
uv pip install -e .
cp .env.example .env
uvicorn app.main:app --reload
```

## Run migrations
```bash
alembic upgrade head
```
