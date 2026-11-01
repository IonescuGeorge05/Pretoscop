"""cadou inclus în ofertă (ex. joc gratuit la consolă): afișat separat, nu scade din prețul final

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-01
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("offers", sa.Column("gift", sa.JSON().with_variant(postgresql.JSONB(), "postgresql")))


def downgrade() -> None:
    op.drop_column("offers", "gift")
