"""Convert timestamp columns to timestamptz.

Revision ID: 0003_timestamptz
Revises: 0002_add_trgm_indexes
Create Date: 2025-01-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0003_timestamptz"
down_revision = "0002_add_trgm_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "metric_definition",
        "created_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="created_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "metric_definition",
        "updated_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="updated_ts AT TIME ZONE 'UTC'",
    )

    op.alter_column(
        "dimension_definition",
        "created_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="created_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "dimension_definition",
        "updated_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="updated_ts AT TIME ZONE 'UTC'",
    )

    op.alter_column(
        "metric_observation",
        "time_start_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="time_start_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "metric_observation",
        "time_end_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="time_end_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "metric_observation",
        "ingested_ts",
        schema="metrics",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="ingested_ts AT TIME ZONE 'UTC'",
    )


def downgrade():
    op.alter_column(
        "metric_observation",
        "ingested_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="ingested_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "metric_observation",
        "time_end_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="time_end_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "metric_observation",
        "time_start_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="time_start_ts AT TIME ZONE 'UTC'",
    )

    op.alter_column(
        "dimension_definition",
        "updated_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="updated_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "dimension_definition",
        "created_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="created_ts AT TIME ZONE 'UTC'",
    )

    op.alter_column(
        "metric_definition",
        "updated_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="updated_ts AT TIME ZONE 'UTC'",
    )
    op.alter_column(
        "metric_definition",
        "created_ts",
        schema="metrics",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="created_ts AT TIME ZONE 'UTC'",
    )
