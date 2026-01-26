"""SQLAlchemy models for the visuals backend."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship

DATETIME_TYPE = datetime


class BaseModel:
    """Base model with shared helpers."""

    __abstract__ = True
    __table__: ClassVar[Table]

    def to_dict(self: BaseModel) -> dict[str, object]:
        """Convert a model instance into a simple dict."""
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}


Base = declarative_base(metadata=MetaData(schema="visuals-backend"), cls=BaseModel)
metadata = Base.metadata


class Dashboard(Base):
    """Dashboard metadata and draft flag."""

    __tablename__ = "dashboards"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(128), nullable=False)
    user_id: Mapped[str] = mapped_column(String(128), primary_key=True, server_default="")
    is_draft: Mapped[bool] = mapped_column(Boolean, primary_key=True, server_default=false())
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[DATETIME_TYPE] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[DATETIME_TYPE] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    tiles: Mapped[list[DashboardTile]] = relationship(
        "DashboardTile",
        back_populates="dashboard",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "((is_draft = true AND user_id <> '') OR (is_draft = false AND user_id = ''))",
            name="ck_dashboards_draft_user",
        ),
        Index(
            "ix_dashboards_client_updated",
            "client_id",
            "is_draft",
            "updated_at",
            "id",
        ),
    )


class DashboardTile(Base):
    """Tile metadata for dashboards."""

    __tablename__ = "dashboard_tiles"

    dashboard_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), primary_key=True, server_default="")
    is_draft: Mapped[bool] = mapped_column(Boolean, primary_key=True, server_default=false())
    tile_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[DATETIME_TYPE] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[DATETIME_TYPE] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    dashboard: Mapped[Dashboard] = relationship("Dashboard", back_populates="tiles")

    __table_args__ = (
        ForeignKeyConstraint(
            ["dashboard_id", "user_id", "is_draft"],
            ["dashboards.id", "dashboards.user_id", "dashboards.is_draft"],
            ondelete="CASCADE",
        ),
        Index(
            "ix_dashboard_tiles_dashboard_position",
            "dashboard_id",
            "user_id",
            "is_draft",
            "position",
        ),
    )
