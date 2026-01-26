"""Add metric search tsvector index for name/type/description.

Revision ID: 0003_metric_search_fields
Revises: 0002_add_metric_search_index
Create Date: 2025-01-03 00:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

revision = "0003_metric_search_fields"
down_revision = "0002_add_metric_search_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply the search fields tsvector migration."""
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_metric_search_fields_tsv "
            "ON metrics.metric_definition USING gin ("
            "("
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(metric_name, ''))), "
            "'A') || "
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(metric_type, ''))), "
            "'B') || "
            "  setweight(to_tsvector('simple', metrics.immutable_unaccent("
            "coalesce(metric_description, ''))), "
            "'C')"
            ")"
            ")",
        ),
    )


def downgrade() -> None:
    """Revert the search fields tsvector migration."""
    op.execute(sa.text("DROP INDEX IF EXISTS metrics.ix_metric_search_fields_tsv"))
