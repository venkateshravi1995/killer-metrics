"""API response caching helpers."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime
from typing import TYPE_CHECKING, Protocol, Self, TypeVar, cast, runtime_checkable

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi import Response

from app.core.cache import cache_get_json, cache_incr, cache_set_json

DEFAULT_TTL_SECONDS = int(os.getenv("API_CACHE_TTL_SECONDS", "60"))
CATALOG_TTL_SECONDS = int(os.getenv("API_CACHE_TTL_CATALOG_SECONDS", "300"))
SEARCH_TTL_SECONDS = int(os.getenv("API_CACHE_TTL_SEARCH_SECONDS", "120"))
QUERY_TTL_SECONDS = int(os.getenv("API_CACHE_TTL_QUERY_SECONDS", "60"))

_CACHE_KEY_PREFIX = os.getenv("API_CACHE_PREFIX", "api")
_METRICS_CACHE_VERSION_KEY = "metrics:data:version"

T = TypeVar("T")


@runtime_checkable
class SupportsModelDump(Protocol):
    """Protocol for pydantic v2 model_dump support."""

    def model_dump(self: Self) -> object:
        """Return a JSON-serializable mapping."""
        ...


@runtime_checkable
class SupportsDict(Protocol):
    """Protocol for pydantic v1 dict support."""

    def dict(self: Self) -> object:
        """Return a JSON-serializable mapping."""
        ...


def _json_default(value: object) -> str:
    if isinstance(value, datetime | date):
        return value.isoformat()
    return str(value)


def normalize_payload(payload: object) -> object:
    """Convert pydantic models to dictionaries when needed."""
    if isinstance(payload, SupportsModelDump):
        return payload.model_dump()
    if isinstance(payload, SupportsDict):
        return payload.dict()
    return payload


def build_cache_key(prefix: str, payload: object | None = None) -> str:
    """Build a stable cache key from the payload."""
    if payload is None:
        return f"{_CACHE_KEY_PREFIX}:{prefix}"
    normalized = normalize_payload(payload)
    raw = json.dumps(normalized, sort_keys=True, default=_json_default, separators=(",", ":"))
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{_CACHE_KEY_PREFIX}:{prefix}:{digest}"


async def cached_json(
    key: str,
    ttl_seconds: int,
    fetcher: Callable[[], Awaitable[T]],
    response: Response | None = None,
) -> T:
    """Return cached JSON if available, otherwise compute and store it."""
    if ttl_seconds <= 0:
        return await fetcher()
    cached = await cache_get_json(key)
    if cached is not None:
        if response is not None:
            response.headers["X-Cache"] = "HIT"
        return cast(T, cached)
    result = await fetcher()
    await cache_set_json(key, result, ttl_seconds)
    if response is not None:
        response.headers["X-Cache"] = "MISS"
    return result


async def get_metrics_cache_version() -> int:
    """Return the cache version used to invalidate metric data responses."""
    value = await cache_get_json(_METRICS_CACHE_VERSION_KEY)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return 0


async def bump_metrics_cache_version() -> None:
    """Increment the cache version used to invalidate metric data responses."""
    await cache_incr(_METRICS_CACHE_VERSION_KEY)
