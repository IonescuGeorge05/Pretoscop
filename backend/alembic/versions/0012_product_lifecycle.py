"""ciclul de viață al modelului: în fabricație (`current`) sau retras (`retired`) + modelul care îl înlocuiește

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("lifecycle", sa.String(20), nullable=False, server_default="current"))
    op.add_column("products", sa.Column("successor", sa.String(100)))


def downgrade() -> None:
    op.drop_column("products", "successor")
    op.drop_column("products", "lifecycle")
