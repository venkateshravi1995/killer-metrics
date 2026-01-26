"""Add dimension search indexes.

Revision ID: 0004_dim_search_indexes
Revises: 0003_metric_search_fields
Create Date: 2025-01-04 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

revision = "0004_dim_search_indexes"
down_revision = "0003_metric_search_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply dimension search index migration."""
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_dimension_search_fields_tsv "
            "ON metrics.dimension_definition USING gin ("
            "("
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(dimension_name, ''))), "
            "'A') || "
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(dimension_key, ''))), "
            "'B') || "
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(dimension_description, ''))), "
            "'C')"
            ")"
            ")",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_dimension_key_unaccent_trgm "
            "ON metrics.dimension_definition USING gin ("
            "  metrics.immutable_unaccent(lower(dimension_key)) gin_trgm_ops"
            ")",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_dimension_name_unaccent_trgm "
            "ON metrics.dimension_definition USING gin ("
            "  metrics.immutable_unaccent(lower(dimension_name)) gin_trgm_ops"
            ")",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_dimension_value_unaccent_trgm "
            "ON metrics.dimension_value USING gin ("
            "  metrics.immutable_unaccent(lower(value)) gin_trgm_ops"
            ")",
        ),
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_dimension_value_search_tsv "
            "ON metrics.dimension_value USING gin ("
            "  to_tsvector('simple', metrics.immutable_unaccent(coalesce(value, '')))"
            ")",
        ),
    )


def downgrade() -> None:
    """Revert dimension search indexes."""
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_value_search_tsv"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_value_unaccent_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_name_unaccent_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_key_unaccent_trgm"))
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_dimension_search_fields_tsv"))
