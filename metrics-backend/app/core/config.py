"""Application configuration for the metrics backend."""

import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv() -> None:
    """Load local .env files into the environment."""
    env_paths = [
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[3] / ".env",
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


def _get_int_env(name: str, default: int) -> int:
    """Parse an integer environment value with a default."""
    raw = os.getenv(name)
    if raw is None:
        return default
    raw = raw.strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


_load_dotenv()


@dataclass(frozen=True)
class Settings:
    """Typed settings loaded from environment variables."""

    database_url: str = os.getenv("DATABASE_URL", "")
    pg_host: str = os.getenv("PG_HOST", "")
    pg_port: str = os.getenv("PG_PORT", "5432")
    pg_database: str = os.getenv("PG_DATABASE", "")
    pg_user: str = os.getenv("PG_USER", "")
    pg_password: str = os.getenv("PG_PASSWORD", "")
    db_pool_size: int = _get_int_env("DB_POOL_SIZE", 10)
    db_max_overflow: int = _get_int_env("DB_MAX_OVERFLOW", 20)
    db_pool_timeout: int = _get_int_env("DB_POOL_TIMEOUT", 30)
    db_pool_recycle: int = _get_int_env("DB_POOL_RECYCLE", 1800)


settings = Settings()
