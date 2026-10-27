"""oferte la precomandă (schema.org PreOrder): disponibile, dar cu livrare ulterioară

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("offers", sa.Column("preorder", sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("offers", "preorder")
