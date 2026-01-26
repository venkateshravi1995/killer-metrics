"""Pydantic schemas for metric endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

SearchField = Literal["metric_name", "metric_description", "metric_type"]


class MetricSearchFilters(BaseModel):
    """Filter set for metric search requests."""

    metric_id: list[int] = Field(default_factory=list)
    metric_key: list[str] = Field(default_factory=list)
    metric_name: list[str] = Field(default_factory=list)
    metric_type: list[str] = Field(default_factory=list)
    unit: list[str] = Field(default_factory=list)
    directionality: list[str] = Field(default_factory=list)
    aggregation: list[str] = Field(default_factory=list)
    is_active: list[bool] = Field(default_factory=list)


class MetricSearchRequest(BaseModel):
    """Payload for metric search."""

    filters: MetricSearchFilters = Field(default_factory=MetricSearchFilters)
    q: str | None = None
    search_fields: list[SearchField] = Field(
        default_factory=lambda: ["metric_name", "metric_description", "metric_type"],
    )
    similarity: float | None = Field(None, ge=0, le=1)
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)


class MetricListQuery(BaseModel):
    """Query parameters for listing metrics."""

    is_active: bool | None = True
    metric_id: list[str] | None = None
    metric_key: list[str] | None = None
    metric_name: list[str] | None = None
    metric_type: list[str] | None = None
    unit: list[str] | None = None
    directionality: list[str] | None = None
    aggregation: list[str] | None = None
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)
