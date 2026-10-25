"""price_points: confirmed_at (până când e confirmat prețul) + origin (scrape | wayback)

Permite istoric cu goluri: un preț e valabil doar de la `ts` până la ultima confirmare (+ toleranță),
nu la infinit. Golurile apar când scraperul n-a rulat (calculator oprit) sau între capturile din arhivă.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("price_points", sa.Column("confirmed_at", sa.DateTime(timezone=True)))
    op.add_column("price_points", sa.Column("origin", sa.String(10), nullable=False, server_default="scrape"))
    # rânduri existente: confirmate până la următoarea schimbare, ultimul până la last_seen_at al ofertei
    op.execute(
        """
        UPDATE price_points pp SET confirmed_at = sub.until
        FROM (
            SELECT p2.id,
                   COALESCE(LEAD(p2.ts) OVER (PARTITION BY p2.offer_id ORDER BY p2.ts), o.last_seen_at) AS until
            FROM price_points p2 JOIN offers o ON o.id = p2.offer_id
        ) sub
        WHERE pp.id = sub.id
        """
    )
    op.alter_column("price_points", "confirmed_at", nullable=False)


def downgrade() -> None:
    op.drop_column("price_points", "origin")
    op.drop_column("price_points", "confirmed_at")
