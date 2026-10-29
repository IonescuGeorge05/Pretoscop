"""buton de oprire per magazin: `enabled = false` oprește imediat orice citire (ex. la cererea scrisă a magazinului)

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("shops", "enabled")
