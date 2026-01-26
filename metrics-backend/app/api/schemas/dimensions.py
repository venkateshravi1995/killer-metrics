"""Pydantic schemas for dimension endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field


class DimensionValuesQuery(BaseModel):
    """Query parameters for listing dimension values."""

    metric_key: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    limit: int = Field(500, ge=1, le=5000)
    offset: int = Field(0, ge=0)
