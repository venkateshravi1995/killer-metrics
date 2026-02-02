"""Neon Auth helpers for request authentication."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from fastapi import Header, HTTPException, status
from jwt import PyJWK, PyJWTError

from app.core import config as _config  # noqa: F401
from app.core.cache import cache_get_json, cache_set_json

HTTP_STATUS_ERROR_THRESHOLD = 400
JWKS_CACHE_TTL_SECONDS = 3600
JWKS_REQUEST_TIMEOUT_SECONDS = 5.0
JWKS_CACHE_KEY_PREFIX = "neon-auth:jwks"

DEFAULT_CLIENT_ID = "local-client"
DEFAULT_USER_ID = "local-user"

logger = logging.getLogger(__name__)

_JWKS_CACHE: dict[str, Any] = {}
_JWKS_LOCK = asyncio.Lock()
_JWKS_STATE = {"expires_at": 0.0}


@dataclass(frozen=True)
class AuthContext:
    """Authenticated request context."""

    user_id: str
    client_id: str
    claims: dict[str, Any]


@dataclass(frozen=True)
class NeonAuthSettings:
    """Configuration for Neon Auth validation."""

    base_url: str
    jwks_url: str
    issuer: str | None
    audience: str | None


def _auth_enforced() -> bool:
    value = (os.getenv("NEON_AUTH_ENFORCE") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _fallback_id(
    header_value: str | None,
    env_key: str,
    default_value: str,
) -> str:
    from_env = (os.getenv(env_key) or "").strip()
    return (header_value or "").strip() or from_env or default_value


def _build_settings() -> NeonAuthSettings:
    base_url = os.getenv("NEON_AUTH_BASE_URL", "").strip()
    jwks_url = os.getenv("NEON_AUTH_JWKS_URL", "").strip()
    if not jwks_url and base_url:
        jwks_url = f"{base_url.rstrip('/')}/.well-known/jwks.json"
    return NeonAuthSettings(
        base_url=base_url,
        jwks_url=jwks_url,
        issuer=os.getenv("NEON_AUTH_ISSUER"),
        audience=os.getenv("NEON_AUTH_AUDIENCE"),
    )


def _resolve_user_id(claims: dict[str, Any]) -> str:
    for key in ("sub", "user_id", "userId", "uid"):
        value = claims.get(key)
        if value:
            return str(value)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token missing user identifier.",
    )


def _jwks_cache_key(settings: NeonAuthSettings) -> str:
    marker = settings.jwks_url or settings.base_url or "default"
    digest = hashlib.sha256(marker.encode("utf-8")).hexdigest()
    return f"{JWKS_CACHE_KEY_PREFIX}:{digest}"


async def _fetch_jwks(settings: NeonAuthSettings) -> dict[str, Any]:
    if not settings.jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="NEON_AUTH_BASE_URL or NEON_AUTH_JWKS_URL is required.",
        )
    async with httpx.AsyncClient(timeout=JWKS_REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(settings.jwks_url)
    if response.status_code >= HTTP_STATUS_ERROR_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch auth keys.",
        )
    return response.json()


async def _get_jwks(settings: NeonAuthSettings, *, force_refresh: bool = False) -> dict[str, Any]:
    now = time.time()
    if not force_refresh and _JWKS_CACHE and now < _JWKS_STATE["expires_at"]:
        return _JWKS_CACHE
    async with _JWKS_LOCK:
        now = time.time()
        if not force_refresh and _JWKS_CACHE and now < _JWKS_STATE["expires_at"]:
            return _JWKS_CACHE
        if not force_refresh:
            cached = await cache_get_json(_jwks_cache_key(settings))
            if isinstance(cached, dict) and cached.get("keys"):
                _JWKS_CACHE.clear()
                _JWKS_CACHE.update(cached)
                _JWKS_STATE["expires_at"] = now + JWKS_CACHE_TTL_SECONDS
                return _JWKS_CACHE
        jwks = await _fetch_jwks(settings)
        _JWKS_CACHE.clear()
        _JWKS_CACHE.update(jwks)
        _JWKS_STATE["expires_at"] = now + JWKS_CACHE_TTL_SECONDS
        await cache_set_json(_jwks_cache_key(settings), jwks, JWKS_CACHE_TTL_SECONDS)
        return _JWKS_CACHE


def _select_signing_key(jwks: dict[str, Any], key_id: str) -> PyJWK | None:
    for key in jwks.get("keys", []):
        if key.get("kid") == key_id:
            return PyJWK(key)
    return None


async def _verify_token(token: str) -> dict[str, Any]:
    settings = _build_settings()
    try:
        header = jwt.get_unverified_header(token)
    except PyJWTError as exc:
        logger.warning("auth token header decode failed", exc_info=exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth token.",
        ) from exc
    key_id = header.get("kid")
    algorithm = header.get("alg") or "EdDSA"
    allowed_algorithms = {"EdDSA", "RS256", "ES256"}
    if algorithm not in allowed_algorithms:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth token.",
        )
    if not key_id:
        logger.warning("auth token missing kid", extra={"alg": header.get("alg")})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth token.",
        )
    jwks = await _get_jwks(settings)
    signing_key = _select_signing_key(jwks, key_id)
    if signing_key is None:
        _JWKS_CACHE.clear()
        jwks = await _get_jwks(settings, force_refresh=True)
        signing_key = _select_signing_key(jwks, key_id)
    if signing_key is None:
        logger.warning("auth token kid not found in jwks", extra={"kid": key_id})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth token.",
        )
    try:
        return jwt.decode(
            token,
            signing_key,
            algorithms=[algorithm],
            issuer=settings.issuer or None,
            audience=settings.audience or None,
            options={"verify_aud": bool(settings.audience), "require": ["exp"]},
        )
    except PyJWTError as exc:
        logger.warning(
            "auth token verification failed",
            extra={
                "kid": key_id,
                "alg": algorithm,
                "issuer": settings.issuer,
                "audience": settings.audience,
            },
            exc_info=exc,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth token.",
        ) from exc


async def require_neon_auth(
    authorization: str | None = Header(default=None, alias="Authorization"),
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> AuthContext:
    """Require a valid Neon Auth JWT bearer token."""
    if not _auth_enforced():
        return AuthContext(
            user_id=_fallback_id(user_id, "NEON_AUTH_FALLBACK_USER_ID", DEFAULT_USER_ID),
            client_id=_fallback_id(
                client_id, "NEON_AUTH_FALLBACK_CLIENT_ID", DEFAULT_CLIENT_ID,
            ),
            claims={},
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token.",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token.",
        )
    claims = await _verify_token(token)
    resolved_user_id = _resolve_user_id(claims)
    return AuthContext(user_id=resolved_user_id, client_id=resolved_user_id, claims=claims)
