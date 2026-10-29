"""Încarcă models.yaml și shops.yaml în DB (upsert după slug). Rulare: python -m app.seed.load"""

import logging
from decimal import Decimal

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SEED_DIR
from app.db import SessionLocal
from app.models import Product, Shop

log = logging.getLogger(__name__)

# cursul folosit pentru MSRP-urile din euro (Sony și Apple nu publică prețuri în lei).
# BNR: 5,3527 lei/€ pe 06.10.2026 (media pe 30 de zile ~5,28) — de actualizat când cursul se mișcă mult.
EUR_RON = Decimal("5.35")


def msrp_from_eur(eur) -> tuple[int, str]:
    """Preț în lei rotunjit la x9 (ca prețurile din magazine) + textul cu calculul, pentru nota din site."""
    ron = Decimal(str(eur)) * EUR_RON
    rounded = int((ron - 9) / 10 + Decimal("0.5")) * 10 + 9
    return rounded, f"{str(eur).replace('.', ',')} € x {str(EUR_RON).replace('.', ',')} lei/€"


def load_yaml(name: str) -> list[dict]:
    with open(SEED_DIR / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def upsert_seed(session: Session) -> None:
    for row in load_yaml("models.yaml"):
        if (eur := row.pop("msrp_eur", None)) is not None:
            row["msrp_ron"], calc = msrp_from_eur(eur)
            row["msrp_note"] = f"{calc}; {row['msrp_note']}" if row.get("msrp_note") else calc
        product = session.scalar(select(Product).where(Product.slug == row["slug"]))
        if product is None:
            session.add(Product(**row))
        else:
            # nu suprascrie un EAN descoperit de scraper cu null din seed
            for key, value in row.items():
                if key == "ean" and value is None:
                    continue
                setattr(product, key, value)

    for row in load_yaml("shops.yaml"):
        row.setdefault("enabled", True)
        shop = session.scalar(select(Shop).where(Shop.slug == row["slug"]))
        if shop is None:
            session.add(Shop(**row))
        else:
            for key, value in row.items():
                setattr(shop, key, value)
    session.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as s:
        upsert_seed(s)
    log.info("seed încărcat")
