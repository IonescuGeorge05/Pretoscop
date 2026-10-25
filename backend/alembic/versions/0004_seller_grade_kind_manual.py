"""vânzător (marketplace), grad refurbished, tipul magazinului, asocieri manuale

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("offers", sa.Column("seller", sa.Text))
    op.add_column("offers", sa.Column("grade", sa.String(30)))
    op.add_column("shops", sa.Column("kind", sa.String(20), nullable=False, server_default="retail"))
    op.create_table(
        "manual_matches",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("shop_id", sa.Integer, sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id")),
        sa.Column("is_bundle", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("ignored", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("shop_id", "url", name="uq_manual_matches_shop_url"),
    )


def downgrade() -> None:
    op.drop_table("manual_matches")
    op.drop_column("shops", "kind")
    op.drop_column("offers", "grade")
    op.drop_column("offers", "seller")
