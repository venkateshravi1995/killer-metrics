from sqlalchemy import (
    Boolean,
    BigInteger,
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
    __abstract__ = True

    def to_dict(self) -> dict:
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}


Base = declarative_base(metadata=MetaData(schema="metrics"), cls=BaseModel)
metadata = Base.metadata


class MetricDefinition(Base):
    __tablename__ = "metric_definition"

    metric_id = Column(BigInteger, primary_key=True)
    metric_key = Column(String(128), nullable=False)
    metric_name = Column(String(256), nullable=False)
    metric_description = Column(String(2048))
    metric_type = Column(String(32), nullable=False)
    unit = Column(String(32))
    directionality = Column(String(16))
    aggregation = Column(String(16), nullable=False)
    is_active = Column(Boolean, nullable=False)
    created_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_ts = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    observations = relationship("MetricObservation", back_populates="metric")


class DimensionDefinition(Base):
    __tablename__ = "dimension_definition"

    dimension_id = Column(BigInteger, primary_key=True)
    dimension_key = Column(String(128), nullable=False)
    dimension_name = Column(String(256), nullable=False)
    dimension_description = Column(String(2048))
    value_type = Column(String(16), nullable=False)
    is_active = Column(Boolean, nullable=False)
    created_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_ts = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    observation_dims = relationship("MetricObservationDim", back_populates="dimension")


class MetricObservation(Base):
    __tablename__ = "metric_observation"

    observation_id = Column(BigInteger, primary_key=True)
    metric_id = Column(
        BigInteger,
        ForeignKey("metrics.metric_definition.metric_id"),
        nullable=False,
    )
    grain = Column(String(16), nullable=False)
    time_start_ts = Column(DateTime(timezone=True), nullable=False)
    time_end_ts = Column(DateTime(timezone=True))
    value_num = Column(Float, nullable=False)
    sample_size = Column(BigInteger)
    is_estimated = Column(Boolean, nullable=False)
    ingested_ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    metric = relationship("MetricDefinition", back_populates="observations")
    dimensions = relationship("MetricObservationDim", back_populates="observation")


class MetricObservationDim(Base):
    __tablename__ = "metric_observation_dim"

    observation_id = Column(
        BigInteger,
        ForeignKey("metrics.metric_observation.observation_id"),
        primary_key=True,
    )
    dimension_id = Column(
        BigInteger,
        ForeignKey("metrics.dimension_definition.dimension_id"),
        primary_key=True,
    )
    dimension_value = Column(String(256), nullable=False)

    observation = relationship("MetricObservation", back_populates="dimensions")
    dimension = relationship("DimensionDefinition", back_populates="observation_dims")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = {"info": {"skip_autogenerate": True}}

    event_time = Column(DateTime(timezone=True), primary_key=True)
    event_type = Column(String(128), primary_key=True)
