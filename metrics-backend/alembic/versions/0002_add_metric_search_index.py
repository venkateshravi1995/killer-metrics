"""Add metric search indexes for hybrid search.

Revision ID: 0002_add_metric_search_index
Revises: 0001_create_metrics_schema
Create Date: 2025-01-02 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

revision = "0002_add_metric_search_index"
down_revision = "0001_create_metrics_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply the search index migration."""
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS unaccent"))
    op.execute(
        sa.text(
            "CREATE OR REPLACE FUNCTION metrics.immutable_unaccent(text) "
            "RETURNS text "
            "LANGUAGE sql "
            "IMMUTABLE "
            "AS $$SELECT metrics.unaccent($1)$$",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_metric_search_tsv "
            "ON metrics.metric_definition USING gin ("
            "("
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(metric_key, ''))), "
            "'A') || "
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(metric_name, ''))), "
            "'B') || "
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(metric_description, ''))), "
            "'C')"
            ")"
            ")",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_metric_key_unaccent_trgm "
            "ON metrics.metric_definition USING gin ("
            "  metrics.immutable_unaccent(lower(metric_key)) gin_trgm_ops"
            ")",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_metric_name_unaccent_trgm "
            "ON metrics.metric_definition USING gin ("
            "  metrics.immutable_unaccent(lower(metric_name)) gin_trgm_ops"
            ")",
        ),
    )


def downgrade() -> None:
    """Revert the search index migration."""
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_metric_name_unaccent_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_metric_key_unaccent_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_metric_search_tsv"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS metrics.immutable_unaccent(text)"))
    op.execute(sa.text("DROP EXTENSION IF EXISTS unaccent"))
