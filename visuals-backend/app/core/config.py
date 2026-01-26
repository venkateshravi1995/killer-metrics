"""Application configuration for the visuals backend."""

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


_load_dotenv()


def _normalize_database_url(url: str) -> str:
    trimmed = url.strip()
    if not trimmed:
        return ""
    if trimmed.startswith("postgresql+psycopg://"):
        return trimmed
    if trimmed.startswith("postgresql+psycopg2://"):
        return trimmed.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    if trimmed.startswith("postgresql://"):
        return trimmed.replace("postgresql://", "postgresql+psycopg://", 1)
    if trimmed.startswith("postgres://"):
        return trimmed.replace("postgres://", "postgresql+psycopg://", 1)
    return trimmed


@dataclass(frozen=True)
class Settings:
    """Typed settings loaded from environment variables."""

    database_url: str = os.getenv("DASHBOARDING_DATABASE_URL", "")
    client_id_header: str = os.getenv("CLIENT_ID_HEADER", "X-Client-Id")
    user_id_header: str = os.getenv("USER_ID_HEADER", "X-User-Id")


def build_database_url() -> str:
    """Build the database URL from environment variables."""
    if settings.database_url:
        return _normalize_database_url(settings.database_url)
    host = os.getenv("DASHBOARDING_PG_HOST") or os.getenv("PG_HOST", "")
    database = os.getenv("DASHBOARDING_PG_DATABASE") or os.getenv("PG_DATABASE", "")
    user = os.getenv("DASHBOARDING_PG_USER") or os.getenv("PG_USER", "")
    password = os.getenv("DASHBOARDING_PG_PASSWORD") or os.getenv("PG_PASSWORD", "")
    port = os.getenv("DASHBOARDING_PG_PORT") or os.getenv("PG_PORT", "5432")
    if host and database and user:
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}"
    return ""


settings = Settings()
