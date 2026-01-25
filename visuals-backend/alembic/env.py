from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db.schema import metadata as target_metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _build_database_url() -> str | None:
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
    url = _build_database_url() or "postgresql://"
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_schemas=False,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _build_database_url()
    if not url:
        raise RuntimeError(
            "DASHBOARDING_DATABASE_URL or PG_* env vars are required for online migrations."
        )
    config.set_main_option("sqlalchemy.url", url)
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=False,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
