import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv() -> None:
    env_paths = [
        Path(__file__).resolve().parents[3] / ".env",
        Path(__file__).resolve().parents[4] / ".env",
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _get_int_env(name: str, default: int) -> int:
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
