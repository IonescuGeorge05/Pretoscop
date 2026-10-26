"""Familiile de produse (seed/families.yaml): numele din `products.family` -> slug pentru URL-uri."""

from functools import lru_cache

import yaml

from app.config import SEED_DIR


@lru_cache
def families() -> list[dict]:
    with open(SEED_DIR / "families.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def family_slug(family: str) -> str:
    return next((f["slug"] for f in families() if f["family"] == family), family.lower().replace(" ", "-"))
