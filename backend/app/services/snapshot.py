"""Export static al datelor (pentru site-ul de pe GitHub Pages): toate răspunsurile API-ului de citire, ca JSON.

    python -m app.services.snapshot --out /tmp/snapshot --source real

Structura: products.json, deals.json, product/<slug>.json, history/<slug>/<range>-<granularity>.json, meta.json.
Rulează în containerul `api` (citește API-ul local); scriptul scripts/publish-pages.sh face restul.
"""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx

API = "http://localhost:8000"
RANGES = ("30d", "90d", "1y")
GRANULARITIES = ("day", "week")


def export(out: Path, source: str) -> dict:
    client = httpx.Client(base_url=API, timeout=120)

    def save(rel: str, path: str, **params) -> dict:
        resp = client.get(path, params={"source": source, **params})
        resp.raise_for_status()
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(resp.text, encoding="utf-8")
        return resp.json()

    products = save("products.json", "/api/products")
    save("deals.json", "/api/deals")
    for p in products["products"]:
        save(f"product/{p['slug']}.json", f"/api/products/{p['slug']}")
        for r in RANGES:
            for g in GRANULARITIES:
                save(f"history/{p['slug']}/{r}-{g}.json", f"/api/products/{p['slug']}/history", range=r, granularity=g)
    meta = {"generated_at": datetime.now(UTC).isoformat(timespec="seconds"), "source": source, "products": len(products["products"])}
    (out / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source", choices=["real", "mock"], default="real")
    args = parser.parse_args()
    print(export(args.out, args.source))
