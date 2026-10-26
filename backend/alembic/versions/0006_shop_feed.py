"""feed de produse pe magazin (XML/CSV primit de la magazin sau din rețeaua de afiliere)

`feed`: {"url": "...", "vat_included": true, "explicit_permission": true}
`explicit_permission` = magazinul ne-a dat link-ul feed-ului (atunci nu mai aplicăm robots.txt pe acel URL).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("feed", JSONB))


def downgrade() -> None:
    op.drop_column("shops", "feed")
