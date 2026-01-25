#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import quote_plus

import psycopg


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value)


def split_sql(sql: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    for raw_line in sql.splitlines():
        line = raw_line.split("--", 1)[0]
        if not line.strip():
            continue
        current.append(line)
        joined = "\n".join(current)
        if ";" in joined:
            parts = joined.split(";")
            for part in parts[:-1]:
                stmt = part.strip()
                if stmt:
                    statements.append(stmt)
            current = [parts[-1]] if parts[-1].strip() else []
    tail = "\n".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


def _rewrite_alembic_version_create(statement: str) -> str:
    if re.search(r"\bIF\s+NOT\s+EXISTS\b", statement, re.IGNORECASE):
        return statement
    if re.match(r"^\s*CREATE\s+TABLE\s+ALEMBIC_VERSION\b", statement, re.IGNORECASE):
        return re.sub(
            r"^\s*CREATE\s+TABLE\s+ALEMBIC_VERSION\b",
            "CREATE TABLE IF NOT EXISTS alembic_version",
            statement,
            flags=re.IGNORECASE,
        )
    return statement


def _is_duplicate_relation_error(statement: str, error: Exception) -> bool:
    sqlstate = getattr(error, "sqlstate", None)
    message = str(error)
    if sqlstate != "42P07" and "already exists" not in message:
        return False
    return bool(
        re.match(
            r"^\s*CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)\b",
            statement,
            flags=re.IGNORECASE,
        )
    )


def _normalize_database_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql://", 1)
    if url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql+psycopg://", "postgresql://", 1)
    return url


def _build_database_url() -> str | None:
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        return _normalize_database_url(url)
    host = os.getenv("PG_HOST")
    database = os.getenv("PG_DATABASE")
    user = os.getenv("PG_USER")
    password = os.getenv("PG_PASSWORD", "")
    port = os.getenv("PG_PORT", "5432")
    if host and database and user:
        auth_user = quote_plus(user)
        auth_password = quote_plus(password) if password else ""
        auth = f"{auth_user}:{auth_password}" if auth_password else auth_user
        return f"postgresql://{auth}@{host}:{port}/{database}"
    return None


def apply_sql(statements: list[str], url: str) -> None:
    with psycopg.connect(url, autocommit=True) as conn:
        for statement in statements:
            statement = _rewrite_alembic_version_create(statement)
            try:
                conn.execute(statement)
            except Exception as exc:
                if _is_duplicate_relation_error(statement, exc):
                    continue
                raise


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: apply_alembic_sql.py /path/to/sql")
        return 1

    load_env(Path(".env"))
    sql_path = Path(sys.argv[1])
    if not sql_path.exists():
        print(f"SQL file not found: {sql_path}")
        return 1

    url = _build_database_url()
    if not url:
        print("Missing DATABASE_URL or PG_* environment values.")
        return 1

    sql = sql_path.read_text(encoding="utf-8")
    statements = split_sql(sql)
    if not statements:
        print("No SQL statements found.")
        return 1

    apply_sql(statements, url)
    print(f"Applied {len(statements)} statements.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
