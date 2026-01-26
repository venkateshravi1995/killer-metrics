"""SQLAlchemy models for the visuals backend."""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    String,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship


class BaseModel:
    """Base model with shared helpers."""

    __abstract__ = True

    def to_dict(self) -> dict[str, object]:
        """Convert a model instance into a simple dict."""
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}


Base = declarative_base(metadata=MetaData(schema="visuals-backend"), cls=BaseModel)
metadata = Base.metadata


class Dashboard(Base):
    """Dashboard metadata and draft flag."""

    __tablename__ = "dashboards"

    id = Column(String(32), primary_key=True)
    client_id = Column(String(128), nullable=False)
    user_id = Column(String(128), primary_key=True, server_default="")
    is_draft = Column(Boolean, primary_key=True, server_default=false())
    name = Column(String(160), nullable=False)
    description = Column(String(2048))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    tiles = relationship(
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

    dashboard_id = Column(String(32), primary_key=True)
    user_id = Column(String(128), primary_key=True, server_default="")
    is_draft = Column(Boolean, primary_key=True, server_default=false())
    tile_id = Column(String(128), primary_key=True)
    position = Column(Integer, nullable=False)
    config = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    dashboard = relationship("Dashboard", back_populates="tiles")

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
