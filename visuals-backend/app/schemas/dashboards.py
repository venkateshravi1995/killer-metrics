from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DashboardBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2048)
    config: dict[str, Any]


class DashboardCreate(DashboardBase):
    pass


class DashboardUpdate(DashboardBase):
    pass


class DashboardOut(DashboardBase):
    id: str
    client_id: str
    created_at: datetime
    updated_at: datetime
    is_draft: bool = False


class DashboardSummary(BaseModel):
    id: str
    name: str
    description: str | None = None
    updated_at: datetime


class DashboardList(BaseModel):
    items: list[DashboardSummary]
    limit: int
    next_cursor: str | None = None


class DashboardMetadataUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2048)


class TilePayload(BaseModel):
    id: str
    model_config = ConfigDict(extra="allow")


class TileLayoutPatch(BaseModel):
    id: str
    layout: dict[str, int]


class TileLayoutUpdate(BaseModel):
    items: list[TileLayoutPatch]
