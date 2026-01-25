"""Create metrics schema and tables.

Revision ID: 0001_create_metrics_schema
Revises: None
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0001_create_metrics_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("CREATE SCHEMA IF NOT EXISTS metrics"))

    op.create_table(
        "metric_definition",
        sa.Column("metric_id", sa.BigInteger(), sa.Identity(start=1, increment=1), primary_key=True),
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
        sa.UniqueConstraint("metric_key", name="uq_metric_definition_metric_key"),
        schema="metrics",
    )
    op.create_index(
        "ix_metric_definition_metric_key",
        "metric_definition",
        ["metric_key"],
        unique=False,
        schema="metrics",
    )

    op.create_table(
        "dimension_definition",
        sa.Column(
            "dimension_id",
            sa.BigInteger(),
            sa.Identity(start=1, increment=1),
            primary_key=True,
        ),
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
        sa.UniqueConstraint("dimension_key", name="uq_dimension_definition_dimension_key"),
        schema="metrics",
    )
    op.create_index(
        "ix_dimension_definition_dimension_key",
        "dimension_definition",
        ["dimension_key"],
        unique=False,
        schema="metrics",
    )

    op.create_table(
        "metric_observation",
        sa.Column(
            "observation_id",
            sa.BigInteger(),
            sa.Identity(start=1, increment=1),
            primary_key=True,
        ),
        sa.Column("metric_id", sa.BigInteger(), nullable=False),
        sa.Column("grain", sa.String(length=16), nullable=False),
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
            ["metric_id"],
            ["metrics.metric_definition.metric_id"],
            name="fk_metric_observation_metric",
        ),
        schema="metrics",
    )
    op.create_index(
        "ix_metric_observation_metric_time",
        "metric_observation",
        ["metric_id", "time_start_ts"],
        unique=False,
        schema="metrics",
    )

    op.create_table(
        "metric_observation_dim",
        sa.Column("observation_id", sa.BigInteger(), nullable=False),
        sa.Column("dimension_id", sa.BigInteger(), nullable=False),
        sa.Column("dimension_value", sa.String(length=256), nullable=False),
        sa.ForeignKeyConstraint(
            ["observation_id"],
            ["metrics.metric_observation.observation_id"],
            name="fk_metric_observation_dim_obs",
        ),
        sa.ForeignKeyConstraint(
            ["dimension_id"],
            ["metrics.dimension_definition.dimension_id"],
            name="fk_metric_observation_dim_dim",
        ),
        sa.PrimaryKeyConstraint("observation_id", "dimension_id"),
        schema="metrics",
    )
    op.create_index(
        "ix_metric_observation_dim_obs_dim_value",
        "metric_observation_dim",
        ["observation_id", "dimension_id", "dimension_value"],
        unique=False,
        schema="metrics",
    )


def downgrade():
    op.drop_index(
        "ix_metric_observation_dim_obs_dim_value",
        table_name="metric_observation_dim",
        schema="metrics",
    )
    op.drop_table("metric_observation_dim", schema="metrics")

    op.drop_index(
        "ix_metric_observation_metric_time",
        table_name="metric_observation",
        schema="metrics",
    )
    op.drop_table("metric_observation", schema="metrics")

    op.drop_index(
        "ix_dimension_definition_dimension_key",
        table_name="dimension_definition",
        schema="metrics",
    )
    op.drop_table("dimension_definition", schema="metrics")

    op.drop_index(
        "ix_metric_definition_metric_key",
        table_name="metric_definition",
        schema="metrics",
    )
    op.drop_table("metric_definition", schema="metrics")

    op.execute(sa.text("DROP SCHEMA IF EXISTS metrics"))
