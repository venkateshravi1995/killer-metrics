"""Pydantic schemas for dashboard endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

DATETIME_TYPE = datetime


class DashboardBase(BaseModel):
    """Shared dashboard fields."""

    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2048)
    config: dict[str, Any]


class DashboardCreate(DashboardBase):
    """Payload for creating dashboards."""


class DashboardUpdate(DashboardBase):
    """Payload for updating dashboards."""


class DashboardOut(DashboardBase):
    """Dashboard response model."""

    id: str
    client_id: str
    created_at: datetime
    updated_at: datetime
    is_draft: bool = False


class DashboardSummary(BaseModel):
    """Summary view of a dashboard."""

    id: str
    name: str
    description: str | None = None
    updated_at: datetime


class DashboardList(BaseModel):
    """Paginated dashboard list response."""

    items: list[DashboardSummary]
    limit: int
    next_cursor: str | None = None


class DashboardMetadataUpdate(BaseModel):
    """Payload for updating dashboard metadata."""

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2048)


class TilePayload(BaseModel):
    """Tile payload for add/update operations."""

    id: str
    model_config = ConfigDict(extra="allow")


class TileLayoutPatch(BaseModel):
    """Single tile layout update."""

    id: str
    layout: dict[str, int]


class TileLayoutUpdate(BaseModel):
    """Batch tile layout update."""

    items: list[TileLayoutPatch]
