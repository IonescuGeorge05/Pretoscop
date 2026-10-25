"""MSRP (preț recomandat de producător) pe produs

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("msrp_ron", sa.Numeric(10, 2)))
    op.add_column("products", sa.Column("msrp_verified", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("products", sa.Column("msrp_note", sa.Text))


def downgrade() -> None:
    for col in ("msrp_note", "msrp_verified", "msrp_ron"):
        op.drop_column("products", col)
