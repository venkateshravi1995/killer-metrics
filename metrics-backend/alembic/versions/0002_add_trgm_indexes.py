"""Enable pg_trgm and add fuzzy-search indexes.

Revision ID: 0002_add_trgm_indexes
Revises: 0001_create_metrics_schema
Create Date: 2025-01-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "0002_add_trgm_indexes"
down_revision = "0001_create_metrics_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    op.execute(
        sa.text(
            "CREATE INDEX ix_metric_definition_metric_key_trgm "
            "ON metrics.metric_definition USING gin (lower(metric_key) gin_trgm_ops)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_metric_definition_metric_name_trgm "
            "ON metrics.metric_definition USING gin (lower(metric_name) gin_trgm_ops)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_dimension_definition_dimension_key_trgm "
            "ON metrics.dimension_definition USING gin (lower(dimension_key) gin_trgm_ops)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_dimension_definition_dimension_name_trgm "
            "ON metrics.dimension_definition USING gin (lower(dimension_name) gin_trgm_ops)"
        )
    )


def downgrade():
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS metrics.ix_dimension_definition_dimension_name_trgm"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS metrics.ix_dimension_definition_dimension_key_trgm"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS metrics.ix_metric_definition_metric_name_trgm"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS metrics.ix_metric_definition_metric_key_trgm"
        )
    )
    op.execute(sa.text("DROP EXTENSION IF EXISTS pg_trgm"))
