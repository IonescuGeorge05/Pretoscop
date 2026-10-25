"""Încarcă models.yaml și shops.yaml în DB (upsert după slug). Rulare: python -m app.seed.load"""

import logging

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SEED_DIR
from app.db import SessionLocal
from app.models import Product, Shop

log = logging.getLogger(__name__)


def load_yaml(name: str) -> list[dict]:
    with open(SEED_DIR / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def upsert_seed(session: Session) -> None:
    for row in load_yaml("models.yaml"):
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
