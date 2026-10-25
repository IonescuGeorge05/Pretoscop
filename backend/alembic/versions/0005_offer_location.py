"""locația anunțului (second hand)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("offers", sa.Column("location", sa.Text))
    op.add_column("offers", sa.Column("posted_label", sa.Text))  # ex. „Azi la 16:59”, „24 octombrie 2026”


def downgrade() -> None:
    op.drop_column("offers", "posted_label")
    op.drop_column("offers", "location")
