.DEFAULT_GOAL := help

.PHONY: help \
	frontend-install frontend-dev frontend-build frontend-start frontend-lint \
	metrics-backend-venv metrics-backend-install metrics-backend-install-dev \
	metrics-backend-run metrics-backend-migrate metrics-backend-seed metrics-backend-apply-sql \
	visuals-backend-venv visuals-backend-install visuals-backend-install-dev \
	visuals-backend-run visuals-backend-migrate \
	install dev dev-all

help:
	@printf '%s\n' \
		'Common commands:' \
		'  make install                    Install all dependencies' \
		'  make dev                        Run frontend + metrics backend' \
		'  make dev-all                    Run frontend + both backends' \
		'' \
		'Frontend:' \
		'  make frontend-install           npm install (frontend)' \
		'  make frontend-dev               next dev (frontend)' \
		'  make frontend-build             next build (frontend)' \
		'  make frontend-start             next start (frontend)' \
		'  make frontend-lint              eslint (frontend)' \
		'' \
		'Metrics backend:' \
		'  make metrics-backend-venv       uv venv (metrics-backend)' \
		'  make metrics-backend-install    uv pip install -e . (metrics-backend)' \
		'  make metrics-backend-install-dev uv pip install -e ".[dev]"' \
		'  make metrics-backend-run        uvicorn app.main:app --reload' \
		'  make metrics-backend-migrate    alembic upgrade head' \
		'  make metrics-backend-seed       python scripts/seed_metrics_data.py' \
		'  make metrics-backend-apply-sql  python scripts/apply_alembic_sql.py' \
		'' \
		'Visuals backend:' \
		'  make visuals-backend-venv       uv venv (visuals-backend)' \
		'  make visuals-backend-install    uv pip install -e . (visuals-backend)' \
		'  make visuals-backend-install-dev uv pip install -e ".[dev]"' \
		'  make visuals-backend-run        uvicorn app.main:app --reload --port 8100' \
		'  make visuals-backend-migrate    alembic upgrade head'

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-start:
	cd frontend && npm run start

frontend-lint:
	cd frontend && npm run lint

metrics-backend-venv:
	cd metrics-backend && uv venv

metrics-backend-install:
	cd metrics-backend && uv pip install -e .

metrics-backend-install-dev:
	cd metrics-backend && uv pip install -e ".[dev]"

metrics-backend-run:
	cd metrics-backend && uv run uvicorn app.main:app --reload

metrics-backend-migrate:
	cd metrics-backend && uv run alembic upgrade head

metrics-backend-seed:
	cd metrics-backend && uv run python scripts/seed_metrics_data.py

metrics-backend-apply-sql:
	cd metrics-backend && uv run python scripts/apply_alembic_sql.py

visuals-backend-venv:
	cd visuals-backend && uv venv

visuals-backend-install:
	cd visuals-backend && uv pip install -e .

visuals-backend-install-dev:
	cd visuals-backend && uv pip install -e ".[dev]"

visuals-backend-run:
	cd visuals-backend && uv run uvicorn app.main:app --reload --port 8100

visuals-backend-migrate:
	cd visuals-backend && uv run alembic upgrade head

install: frontend-install metrics-backend-venv metrics-backend-install visuals-backend-venv visuals-backend-install

dev:
	$(MAKE) -j 2 frontend-dev metrics-backend-run

dev-all:
	$(MAKE) -j 3 frontend-dev metrics-backend-run visuals-backend-run
