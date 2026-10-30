"""alerte de preț / stoc pe email (cu confirmare) și prețuri semnalate de cititori („Am găsit mai ieftin”)

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "price_alerts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, index=True),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),  # price | stock
        sa.Column("target_price", sa.Numeric(10, 2)),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("last_sent_at", sa.DateTime(timezone=True)),
        sa.Column("last_sent_price", sa.Numeric(10, 2)),
    )
    op.create_table(
        "user_reports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("domain", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("status", sa.String(10), nullable=False, server_default="new"),  # new | accepted | rejected
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("user_reports")
    op.drop_table("price_alerts")
