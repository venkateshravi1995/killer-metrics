"""Local auth helpers for request identity."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from fastapi import Header

DEFAULT_CLIENT_ID = "local-client"
DEFAULT_USER_ID = "local-user"

if TYPE_CHECKING:
    from collections.abc import Iterable


@dataclass(frozen=True)
class AuthContext:
    """Authenticated request context."""

    user_id: str
    client_id: str
    claims: dict[str, Any]


def _fallback_id(
    header_value: str | None,
    env_keys: Iterable[str],
    default_value: str,
) -> str:
    header = (header_value or "").strip()
    if header:
        return header
    for key in env_keys:
        from_env = (os.getenv(key) or "").strip()
        if from_env:
            return from_env
    return default_value


async def require_local_auth(
    client_id: str | None = Header(default=None, alias="X-Client-Id"),
    user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> AuthContext:
    """Return a local auth context for demo usage."""
    resolved_user_id = _fallback_id(
        user_id,
        ("LOCAL_AUTH_USER_ID", "NEON_AUTH_FALLBACK_USER_ID"),
        DEFAULT_USER_ID,
    )
    resolved_client_id = _fallback_id(
        client_id,
        ("LOCAL_AUTH_CLIENT_ID", "NEON_AUTH_FALLBACK_CLIENT_ID"),
        DEFAULT_CLIENT_ID,
    )
    return AuthContext(
        user_id=resolved_user_id,
        client_id=resolved_client_id,
        claims={},
    )
