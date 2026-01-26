"""SQLAlchemy models for the metrics schema."""

from typing import ClassVar

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    MetaData,
    String,
    func,
)
from sqlalchemy.orm import declarative_base, relationship


class BaseModel:
    """Base model with shared helpers."""

    __abstract__ = True

    def to_dict(self) -> dict[str, object]:
        """Convert a model instance into a simple dict."""
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}


Base = declarative_base(metadata=MetaData(schema="metrics"), cls=BaseModel)
metadata = Base.metadata


class MetricDefinition(Base):
    """Definition metadata for a metric."""

    __tablename__ = "metric_definition"

    metric_id = Column(BigInteger, primary_key=True)
    metric_key = Column(String(128), nullable=False)
    metric_name = Column(String(256), nullable=False)
    metric_description = Column(String(2048))
    metric_type = Column(String(32), nullable=False)
    unit = Column(String(32))
    directionality = Column(String(16))
    aggregation = Column(String(16), nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_ts = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    series = relationship("MetricSeries", back_populates="metric")


class DimensionDefinition(Base):
    """Definition metadata for a dimension."""

    __tablename__ = "dimension_definition"

    dimension_id = Column(BigInteger, primary_key=True)
    dimension_key = Column(String(128), nullable=False)
    dimension_name = Column(String(256), nullable=False)
    dimension_description = Column(String(2048))
    value_type = Column(String(16), nullable=False, server_default="string")
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_ts = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    values = relationship("DimensionValue", back_populates="dimension")


class DimensionValue(Base):
    """Concrete dimension value entry."""

    __tablename__ = "dimension_value"

    value_id = Column(BigInteger, primary_key=True)
    dimension_id = Column(
        BigInteger,
        ForeignKey("metrics.dimension_definition.dimension_id"),
        nullable=False,
    )
    value = Column(String(256), nullable=False)
    created_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    dimension = relationship("DimensionDefinition", back_populates="values")
    set_values = relationship("DimensionSetValue", back_populates="dimension_value")


class DimensionSet(Base):
    """A set of dimension/value pairs."""

    __tablename__ = "dimension_set"

    set_id = Column(BigInteger, primary_key=True)
    set_hash = Column(String(64), nullable=False)
    created_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    values = relationship("DimensionSetValue", back_populates="dimension_set")


class DimensionSetValue(Base):
    """Join table for dimension sets and values."""

    __tablename__ = "dimension_set_value"

    set_id = Column(
        BigInteger,
        ForeignKey("metrics.dimension_set.set_id"),
        primary_key=True,
    )
    value_id = Column(
        BigInteger,
        ForeignKey("metrics.dimension_value.value_id"),
        primary_key=True,
    )
    dimension_id = Column(BigInteger, nullable=False)

    dimension_set = relationship("DimensionSet", back_populates="values")
    dimension_value = relationship("DimensionValue", back_populates="set_values")


class MetricSeries(Base):
    """Series metadata for metric observations."""

    __tablename__ = "metric_series"

    series_id = Column(BigInteger, primary_key=True)
    metric_id = Column(
        BigInteger,
        ForeignKey("metrics.metric_definition.metric_id"),
        nullable=False,
    )
    grain = Column(String(16), nullable=False)
    set_id = Column(
        BigInteger,
        ForeignKey("metrics.dimension_set.set_id"),
        nullable=False,
    )

    metric = relationship("MetricDefinition", back_populates="series")
    dimension_set = relationship("DimensionSet")
    observations = relationship("MetricObservation", back_populates="series")


class MetricObservation(Base):
    """Observation values for a metric series."""

    __tablename__ = "metric_observation"

    observation_id = Column(BigInteger, primary_key=True)
    series_id = Column(
        BigInteger,
        ForeignKey("metrics.metric_series.series_id"),
        nullable=False,
    )
    time_start_ts = Column(DateTime(timezone=True), nullable=False)
    time_end_ts = Column(DateTime(timezone=True))
    value_num = Column(Float, nullable=False)
    sample_size = Column(BigInteger)
    is_estimated = Column(Boolean, nullable=False, server_default="false")
    ingested_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    series = relationship("MetricSeries", back_populates="observations")


class Event(Base):
    """Internal event log entry."""

    __tablename__ = "events"
    __table_args__: ClassVar[dict[str, dict[str, bool]]] = {"info": {"skip_autogenerate": True}}

    event_time = Column(DateTime(timezone=True), primary_key=True)
    event_type = Column(String(128), primary_key=True)
