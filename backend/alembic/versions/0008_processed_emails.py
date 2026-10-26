"""emailuri OLX deja procesate (căsuța utilizatorului nu se modifică: nu marcăm nimic citit)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processed_emails",
        sa.Column("message_id", sa.String(500), primary_key=True),
        sa.Column("subject", sa.Text),
        sa.Column("received_at", sa.DateTime(timezone=True)),
        sa.Column("offers_found", sa.Integer, nullable=False, server_default="0"),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("processed_emails")
