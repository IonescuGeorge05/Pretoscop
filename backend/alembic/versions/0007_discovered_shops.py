"""magazine descoperite prin căutare web (candidați pentru scraping / cerere de feed)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discovered_shops",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("domain", sa.String(200), nullable=False, unique=True),
        sa.Column("example_url", sa.Text, nullable=False),
        sa.Column("example_title", sa.Text),
        sa.Column("query", sa.Text),
        sa.Column("hits", sa.Integer, nullable=False, server_default="1"),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),  # new | ignored
        sa.Column("check", JSONB),  # rezultatul verificării: robots, sitemap, date structurate
    )


def downgrade() -> None:
    op.drop_table("discovered_shops")
