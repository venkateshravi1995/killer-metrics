"""Rebuild metrics schema for series + dimension sets.

Revision ID: 0004_rebuild_metrics_schema
Revises: 0003_timestamptz
Create Date: 2025-01-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0004_rebuild_metrics_schema"
down_revision = "0003_timestamptz"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS metrics"))
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    op.execute(sa.text("DROP TABLE IF EXISTS metrics.metric_observation_dim CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.metric_observation CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.metric_series CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.dimension_set_value CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.dimension_set CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.dimension_value CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.dimension_definition CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics.metric_definition CASCADE"))

    op.create_table(
        "metric_definition",
        sa.Column("metric_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("metric_key", sa.String(length=128), nullable=False),
        sa.Column("metric_name", sa.String(length=256), nullable=False),
        sa.Column("metric_description", sa.String(length=2048)),
        sa.Column("metric_type", sa.String(length=32), nullable=False),
        sa.Column("unit", sa.String(length=32)),
        sa.Column("directionality", sa.String(length=16)),
        sa.Column("aggregation", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("metric_key = lower(metric_key)", name="ck_metric_key_lower"),
        sa.UniqueConstraint("metric_key", name="uq_metric_key"),
        schema="metrics",
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_metric_key_trgm "
            "ON metrics.metric_definition USING gin (lower(metric_key) gin_trgm_ops)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_metric_name_trgm "
            "ON metrics.metric_definition USING gin (lower(metric_name) gin_trgm_ops)"
        )
    )

    op.create_table(
        "dimension_definition",
        sa.Column("dimension_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("dimension_key", sa.String(length=128), nullable=False),
        sa.Column("dimension_name", sa.String(length=256), nullable=False),
        sa.Column("dimension_description", sa.String(length=2048)),
        sa.Column("value_type", sa.String(length=16), nullable=False, server_default="string"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("dimension_key = lower(dimension_key)", name="ck_dimension_key_lower"),
        sa.UniqueConstraint("dimension_key", name="uq_dimension_key"),
        schema="metrics",
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_dimension_key_trgm "
            "ON metrics.dimension_definition USING gin (lower(dimension_key) gin_trgm_ops)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_dimension_name_trgm "
            "ON metrics.dimension_definition USING gin (lower(dimension_name) gin_trgm_ops)"
        )
    )

    op.create_table(
        "dimension_value",
        sa.Column("value_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("dimension_id", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.String(length=256), nullable=False),
        sa.Column(
            "created_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["dimension_id"],
            ["metrics.dimension_definition.dimension_id"],
        ),
        sa.UniqueConstraint("dimension_id", "value", name="uq_dimension_value"),
        sa.UniqueConstraint("dimension_id", "value_id", name="uq_dimension_value_dim_valueid"),
        schema="metrics",
    )

    op.create_table(
        "dimension_set",
        sa.Column("set_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("set_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("set_hash", name="uq_dimension_set_hash"),
        schema="metrics",
    )

    op.create_table(
        "dimension_set_value",
        sa.Column("set_id", sa.BigInteger(), nullable=False),
        sa.Column("dimension_id", sa.BigInteger(), nullable=False),
        sa.Column("value_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["set_id"],
            ["metrics.dimension_set.set_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["dimension_id", "value_id"],
            ["metrics.dimension_value.dimension_id", "metrics.dimension_value.value_id"],
            ondelete="CASCADE",
            name="fk_dsv_dim_value",
        ),
        sa.PrimaryKeyConstraint("set_id", "value_id", name="pk_dimension_set_value"),
        schema="metrics",
    )
    op.create_index(
        "ix_dsv_dim_value_set",
        "dimension_set_value",
        ["dimension_id", "value_id", "set_id"],
        unique=False,
        schema="metrics",
    )
    op.create_index(
        "ix_dsv_value_set",
        "dimension_set_value",
        ["value_id", "set_id"],
        unique=False,
        schema="metrics",
    )

    op.create_table(
        "metric_series",
        sa.Column("series_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("metric_id", sa.BigInteger(), nullable=False),
        sa.Column("grain", sa.String(length=16), nullable=False),
        sa.Column("set_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["metric_id"],
            ["metrics.metric_definition.metric_id"],
        ),
        sa.ForeignKeyConstraint(
            ["set_id"],
            ["metrics.dimension_set.set_id"],
        ),
        sa.UniqueConstraint("metric_id", "grain", "set_id", name="uq_metric_series"),
        schema="metrics",
    )
    op.create_index(
        "ix_metric_series_set_id",
        "metric_series",
        ["set_id"],
        unique=False,
        schema="metrics",
    )

    op.create_table(
        "metric_observation",
        sa.Column("observation_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("series_id", sa.BigInteger(), nullable=False),
        sa.Column("time_start_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_end_ts", sa.DateTime(timezone=True)),
        sa.Column("value_num", sa.Float(), nullable=False),
        sa.Column("sample_size", sa.BigInteger()),
        sa.Column("is_estimated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "ingested_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["series_id"],
            ["metrics.metric_series.series_id"],
        ),
        sa.CheckConstraint(
            "time_end_ts IS NULL OR time_end_ts > time_start_ts",
            name="ck_obs_time_range",
        ),
        sa.CheckConstraint(
            "sample_size IS NULL OR sample_size >= 0",
            name="ck_obs_sample_nonneg",
        ),
        sa.UniqueConstraint("series_id", "time_start_ts", name="uq_obs_series_time"),
        schema="metrics",
    )

    op.create_table(
        "alembic_version",
        sa.Column("version_num", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("version_num", name="alembic_version_pkc"),
        schema="metrics",
    )


def downgrade():
    op.drop_table("alembic_version", schema="metrics")
    op.drop_table("metric_observation", schema="metrics")
    op.drop_index("ix_metric_series_set_id", table_name="metric_series", schema="metrics")
    op.drop_table("metric_series", schema="metrics")
    op.drop_index("ix_dsv_value_set", table_name="dimension_set_value", schema="metrics")
    op.drop_index("ix_dsv_dim_value_set", table_name="dimension_set_value", schema="metrics")
    op.drop_table("dimension_set_value", schema="metrics")
    op.drop_table("dimension_set", schema="metrics")
    op.drop_table("dimension_value", schema="metrics")
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_name_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_key_trgm"))
    op.drop_table("dimension_definition", schema="metrics")
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_metric_name_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_metric_key_trgm"))
    op.drop_table("metric_definition", schema="metrics")
