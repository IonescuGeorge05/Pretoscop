"""schema inițială

Revision ID: 0001
Revises:
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("family", sa.String(100), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("edition", sa.String(20), nullable=False),
        sa.Column("storage_gb", sa.Integer, nullable=False),
        sa.Column("model_code", sa.String(50)),
        sa.Column("ean", sa.String(14)),
        sa.Column("image_url", sa.Text),
    )
    op.create_table(
        "shops",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("base_url", sa.Text, nullable=False),
        sa.Column("search_url_template", sa.Text),
        sa.Column("shipping_rules", JSONB, nullable=False, server_default="{}"),
        sa.Column("shipping_verified", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("default_warranty_months", sa.Integer, nullable=False, server_default="24"),
        sa.Column("affiliate_url_template", sa.Text),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("status_reason", sa.Text),
        sa.Column("last_scraped_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "offers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id"), nullable=False, index=True),
        sa.Column("shop_id", sa.Integer, sa.ForeignKey("shops.id"), nullable=False, index=True),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("title", sa.Text),
        sa.Column("affiliate_url", sa.Text),
        sa.Column("warranty_months", sa.Integer),
        sa.Column("condition", sa.String(20), nullable=False, server_default="new"),
        sa.Column("is_bundle", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(10), nullable=False, server_default="real"),
        sa.UniqueConstraint("shop_id", "url", "source", name="uq_offers_shop_url_source"),
    )
    op.create_table(
        "price_points",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("offer_id", sa.Integer, sa.ForeignKey("offers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("old_price", sa.Numeric(10, 2)),
        sa.Column("in_stock", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_price_points_offer_ts", "price_points", ["offer_id", "ts"])
    op.create_table(
        "unmatched_listings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("shop_id", sa.Integer, sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("reason", sa.Text),
        sa.Column("raw", JSONB, nullable=False, server_default="{}"),
        sa.Column("scraped_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("shop_id", "url", name="uq_unmatched_shop_url"),
    )
    op.create_table(
        "clicks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("offer_id", sa.Integer, sa.ForeignKey("offers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("target_url", sa.Text, nullable=False),
        sa.Column("referer", sa.Text),
        sa.Column("user_agent", sa.Text),
    )


def downgrade() -> None:
    for table in ("clicks", "unmatched_listings", "price_points", "offers", "shops", "products"):
        op.drop_table(table)
