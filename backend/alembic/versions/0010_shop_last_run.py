"""rezumatul ultimei rulări a scraperului, per magazin (pentru pagina de stare a surselor din admin)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("last_run", JSONB))


def downgrade() -> None:
    op.drop_column("shops", "last_run")
