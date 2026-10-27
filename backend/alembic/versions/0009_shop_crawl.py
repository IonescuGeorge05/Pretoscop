"""configurare de crawl generic pe magazin (sitemap + date structurate), fără cod dedicat

`crawl`: {"type": "sitemap", "sitemap": "https://.../sitemap.xml" (opțional), "max_products": 60}

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("crawl", JSONB))


def downgrade() -> None:
    op.drop_column("shops", "crawl")
