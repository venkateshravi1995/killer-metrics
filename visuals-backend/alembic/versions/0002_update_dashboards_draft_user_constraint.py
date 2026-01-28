"""Relax dashboards draft/user check constraint.

Revision ID: 0002_update_dashboards_draft_user_constraint
Revises: 0001_create_dashboard_tables
Create Date: 2026-01-27 00:00:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_update_dashboards_draft_user_constraint"
down_revision = "0001_create_dashboard_tables"
branch_labels = None
depends_on = None

SCHEMA_NAME = "visuals-backend"
TABLE_NAME = "dashboards"
CONSTRAINT_NAME = "ck_dashboards_draft_user"


def upgrade() -> None:
    """Allow user_id on published dashboards."""
    op.drop_constraint(
        CONSTRAINT_NAME,
        TABLE_NAME,
        schema=SCHEMA_NAME,
        type_="check",
    )
    op.create_check_constraint(
        CONSTRAINT_NAME,
        TABLE_NAME,
        "(user_id <> '')",
        schema=SCHEMA_NAME,
    )


def downgrade() -> None:
    """Restore original draft/user check constraint."""
    op.drop_constraint(
        CONSTRAINT_NAME,
        TABLE_NAME,
        schema=SCHEMA_NAME,
        type_="check",
    )
    op.create_check_constraint(
        CONSTRAINT_NAME,
        TABLE_NAME,
        "(is_draft = true AND user_id <> '') OR (is_draft = false AND user_id = '')",
        schema=SCHEMA_NAME,
    )
