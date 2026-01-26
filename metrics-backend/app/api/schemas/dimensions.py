"""Pydantic schemas for dimension endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DimensionValuesQuery(BaseModel):
    """Query parameters for listing dimension values."""

    metric_key: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)


DimensionSearchField = Literal[
    "dimension_name",
    "dimension_description",
    "dimension_key",
]


class DimensionSearchFilters(BaseModel):
    """Filter set for dimension search requests."""

    dimension_id: list[int] = Field(default_factory=list)
    dimension_key: list[str] = Field(default_factory=list)
    dimension_name: list[str] = Field(default_factory=list)
    value_type: list[str] = Field(default_factory=list)
    is_active: list[bool] = Field(default_factory=list)


class DimensionSearchRequest(BaseModel):
    """Payload for dimension search."""

    filters: DimensionSearchFilters = Field(default_factory=DimensionSearchFilters)
    q: str | None = None
    search_fields: list[DimensionSearchField] = Field(
        default_factory=lambda: ["dimension_name", "dimension_description"],
    )
    similarity: float | None = Field(None, ge=0, le=1)
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)


class DimensionValueSearchFilters(BaseModel):
    """Filter set for dimension value search requests."""

    dimension_key: list[str] = Field(default_factory=list)
    metric_key: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class DimensionValueSearchRequest(BaseModel):
    """Payload for dimension value search."""

    filters: DimensionValueSearchFilters = Field(default_factory=DimensionValueSearchFilters)
    q: str | None = None
    similarity: float | None = Field(None, ge=0, le=1)
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)
