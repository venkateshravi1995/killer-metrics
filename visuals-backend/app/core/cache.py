"""Shared caching helpers."""

from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime

import redis.asyncio as redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

JSONValue = str | int | float | bool | None | list["JSONValue"] | dict[str, "JSONValue"]

_REDIS_CLIENT: dict[str, redis.Redis] = {}


def _get_redis_client() -> redis.Redis | None:
    url = (os.getenv("REDIS_URL") or os.getenv("KV_URL") or "").strip()
    if not url:
        return None
    client = _REDIS_CLIENT.get("client")
    if client is None:
        client = redis.from_url(url, decode_responses=True)
        _REDIS_CLIENT["client"] = client
    return client


async def cache_get_json(key: str) -> JSONValue | None:
    """Fetch a JSON value from Redis, returning None on cache miss or errors."""
    client = _get_redis_client()
    if client is None:
        return None
    try:
        value = await client.get(key)
    except RedisError as exc:  # pragma: no cover - defensive logging for infra
        logger.warning("redis get failed", exc_info=exc)
        return None
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


async def cache_set_json(key: str, value: object, ttl_seconds: int) -> None:
    """Store a JSON value in Redis with a TTL, ignoring failures."""
    client = _get_redis_client()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value, default=_json_default), ex=ttl_seconds)
    except RedisError as exc:  # pragma: no cover - defensive logging for infra
        logger.warning("redis set failed", exc_info=exc)


async def cache_incr(key: str) -> int | None:
    """Increment a Redis counter and return the new value (or None on failure)."""
    client = _get_redis_client()
    if client is None:
        return None
    try:
        return int(await client.incr(key))
    except RedisError as exc:  # pragma: no cover - defensive logging for infra
        logger.warning("redis incr failed", exc_info=exc)
        return None


def _json_default(value: object) -> str:
    if isinstance(value, datetime | date):
        return value.isoformat()
    return str(value)
