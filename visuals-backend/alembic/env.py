"""Alembic environment configuration for the visuals backend."""

from __future__ import annotations

import os
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool, text

from alembic import context
from app.db.schema import metadata as target_metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

DEFAULT_SCHEMA = target_metadata.schema or "public"

MIGRATION_URL_ERROR = (
    "DASHBOARDING_DATABASE_URL or PG_* env vars are required for online migrations."
)


def _quote_ident(identifier: str) -> str:
    """Quote an identifier for schema-qualified SQL usage."""
    return '"' + identifier.replace('"', '""') + '"'


def _load_dotenv() -> None:
    """Load local .env files into the environment for migrations."""
    env_paths = [
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line_text = raw_line.strip()
            if not line_text or line_text.startswith("#"):
                continue
            if line_text.startswith("export "):
                line_text = line_text[len("export ") :].strip()
            if "=" not in line_text:
                continue
            key, value = line_text.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _build_database_url() -> str | None:
    """Build the database URL for Alembic migrations."""
    url = os.getenv("DASHBOARDING_DATABASE_URL") or os.getenv("DATABASE_URL")
    if url:
        if "+psycopg2" in url:
            return url.replace("+psycopg2", "+psycopg")
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        return url
    host = os.getenv("DASHBOARDING_PG_HOST") or os.getenv("PG_HOST")
    database = os.getenv("DASHBOARDING_PG_DATABASE") or os.getenv("PG_DATABASE")
    user = os.getenv("DASHBOARDING_PG_USER") or os.getenv("PG_USER")
    password = os.getenv("DASHBOARDING_PG_PASSWORD") or os.getenv("PG_PASSWORD", "")
    port = os.getenv("DASHBOARDING_PG_PORT") or os.getenv("PG_PORT", "5432")
    if host and database and user:
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}"
    return None


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""
    url = _build_database_url() or "postgresql://"
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_schemas=True,
        compare_type=True,
        version_table_schema=DEFAULT_SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in online mode."""
    url = _build_database_url()
    if not url:
        raise RuntimeError(MIGRATION_URL_ERROR)
    config.set_main_option("sqlalchemy.url", url)
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        quoted_schema = _quote_ident(DEFAULT_SCHEMA)
        search_path = quoted_schema if DEFAULT_SCHEMA == "public" else f"{quoted_schema}, public"
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            compare_type=True,
            version_table_schema=DEFAULT_SCHEMA,
        )
        with context.begin_transaction():
            if DEFAULT_SCHEMA != "public":
                connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {quoted_schema}"))
            connection.execute(text(f"SET search_path TO {search_path}"))
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
