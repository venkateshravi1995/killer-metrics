from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DimensionFilter(BaseModel):
    dimension_key: str
    values: list[str] = Field(default_factory=list)


class AggregateQuery(BaseModel):
    metric_keys: list[str] = Field(min_length=1)
    grain: str
    start_time: datetime
    end_time: datetime
    group_by: list[str] = Field(default_factory=list)
    filters: list[DimensionFilter] = Field(default_factory=list)


class TimeseriesQuery(BaseModel):
    metric_keys: list[str] = Field(min_length=1)
    grain: str
    start_time: datetime
    end_time: datetime
    group_by: list[str] = Field(default_factory=list)
    filters: list[DimensionFilter] = Field(default_factory=list)


class TopKQuery(BaseModel):
    metric_key: str
    grain: str
    start_time: datetime
    end_time: datetime
    group_by: list[str] = Field(default_factory=list)
    filters: list[DimensionFilter] = Field(default_factory=list)
    k: int = 10
    order: Literal["asc", "desc"] = "desc"
