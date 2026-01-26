"""Pydantic schemas for metric query endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DimensionFilter(BaseModel):
    """Filter definition for dimension key/value matching."""

    dimension_key: str
    values: list[str] = Field(default_factory=list)


class AggregateQuery(BaseModel):
    """Payload for aggregate metric queries."""

    metric_keys: list[str] = Field(min_length=1)
    grain: str
    start_time: datetime
    end_time: datetime
    group_by: list[str] = Field(default_factory=list)
    filters: list[DimensionFilter] = Field(default_factory=list)


class TimeseriesQuery(BaseModel):
    """Payload for timeseries metric queries."""

    metric_keys: list[str] = Field(min_length=1)
    grain: str
    start_time: datetime
    end_time: datetime
    group_by: list[str] = Field(default_factory=list)
    filters: list[DimensionFilter] = Field(default_factory=list)


class TopKQuery(BaseModel):
    """Payload for top-K metric queries."""

    metric_key: str
    grain: str
    start_time: datetime
    end_time: datetime
    group_by: list[str] = Field(default_factory=list)
    filters: list[DimensionFilter] = Field(default_factory=list)
    k: int = 10
    order: Literal["asc", "desc"] = "desc"
