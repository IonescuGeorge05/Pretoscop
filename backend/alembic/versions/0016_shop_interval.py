"""interval de citire per magazin (ore); gol = SCRAPE_INTERVAL_HOURS (implicit 6)

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("interval_hours", sa.Float))


def downgrade() -> None:
    op.drop_column("shops", "interval_hours")
