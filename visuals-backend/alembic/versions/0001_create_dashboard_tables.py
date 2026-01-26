"""Create dashboard tables.

Revision ID: 0001_create_dashboard_tables
Revises:
Create Date: 2024-06-01 00:00:00.000000
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_create_dashboard_tables"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA_NAME = "visuals-backend"


def upgrade() -> None:
    """Create dashboard tables and indexes."""
    op.execute(sa.text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA_NAME}"'))
    op.create_table(
        "dashboards",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("client_id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=128), server_default=sa.text("''"), nullable=False),
        sa.Column("is_draft", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=2048)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id", "user_id", "is_draft"),
        sa.CheckConstraint(
            "(is_draft = true AND user_id <> '') OR (is_draft = false AND user_id = '')",
            name="ck_dashboards_draft_user",
        ),
        schema=SCHEMA_NAME,
    )
    op.create_index(
        "ix_dashboards_client_updated",
        "dashboards",
        ["client_id", "is_draft", "updated_at", "id"],
        schema=SCHEMA_NAME,
    )

    op.create_table(
        "dashboard_tiles",
        sa.Column(
            "dashboard_id",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(length=128), server_default=sa.text("''"), nullable=False),
        sa.Column("is_draft", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("tile_id", sa.String(length=128), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["dashboard_id", "user_id", "is_draft"],
            [
                f"{SCHEMA_NAME}.dashboards.id",
                f"{SCHEMA_NAME}.dashboards.user_id",
                f"{SCHEMA_NAME}.dashboards.is_draft",
            ],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("dashboard_id", "user_id", "is_draft", "tile_id"),
        schema=SCHEMA_NAME,
    )
    op.create_index(
        "ix_dashboard_tiles_dashboard_position",
        "dashboard_tiles",
        ["dashboard_id", "user_id", "is_draft", "position"],
        schema=SCHEMA_NAME,
    )


def downgrade() -> None:
    """Drop dashboard tables and indexes."""
    op.drop_index(
        "ix_dashboard_tiles_dashboard_position",
        table_name="dashboard_tiles",
        schema=SCHEMA_NAME,
    )
    op.drop_table("dashboard_tiles", schema=SCHEMA_NAME)
    op.drop_index(
        "ix_dashboards_client_updated",
        table_name="dashboards",
        schema=SCHEMA_NAME,
    )
    op.drop_table("dashboards", schema=SCHEMA_NAME)
    op.execute(sa.text(f'DROP SCHEMA IF EXISTS "{SCHEMA_NAME}"'))
