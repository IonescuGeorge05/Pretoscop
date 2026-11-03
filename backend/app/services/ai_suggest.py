"""Sugestii AI pentru anunțurile nepotrivite: Claude citește titlul și propune modelul din catalog (sau „niciunul”).

Regula „matcher-ul nu ghicește” rămâne: sugestia doar se afișează în /admin, lângă anunț; asocierea o face un om, cu
un clic. Fără ANTHROPIC_API_KEY în .env, nimic de aici nu rulează. Se trimite doar titlul public al anunțului și
prețul (fără oraș, vânzător sau link).
"""

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Product, UnmatchedListing

log = logging.getLogger("ai")

SYSTEM = """Ești asistentul unui comparator de prețuri din România. Primești titlul unui anunț (magazin sau second hand) \
și trebuie să spui cărui produs din catalogul de mai jos îi corespunde.

Reguli:
- Alegi un produs DOAR dacă titlul îl identifică fără dubiu: generația, ediția (cu disc / Digital) și stocarea unde \
contează. Dacă lipsește ceva esențial (ex. „PS5 slim 1TB” fără să spună dacă e Digital sau cu disc, „iPhone 17 Pro” fără \
stocare), răspunzi „none”. Nu ghici: un răspuns greșit e mai rău decât „none”.
- Accesoriile, jocurile, piesele, replicile, consolele modate și cererile de cumpărare sunt „none”.
- „is_bundle” = consola sau telefonul vine cu altceva (jocuri, controller în plus, căști).
- „reason”: o propoziție scurtă, în română, cu ce din titlu te-a făcut să alegi (sau ce lipsește).
- „confidence”: între 0 și 1.

Catalog (slug | nume | familie | ediție | stocare GB):
"""


def catalog_text(products: list[Product]) -> str:
    """Lista de produse, sortată stabil după slug (același text la fiecare cerere = prefix care se poate refolosi)."""
    rows = sorted(products, key=lambda p: p.slug)
    return "\n".join(f"{p.slug} | {p.name} | {p.family} | {p.edition} | {p.storage_gb}" for p in rows)


def schema(slugs: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "product_slug": {"type": "string", "enum": sorted(slugs) + ["none"]},
            "is_bundle": {"type": "boolean"},
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": ["product_slug", "is_bundle", "confidence", "reason"],
        "additionalProperties": False,
    }


def enabled() -> bool:
    return bool(settings.anthropic_api_key)


def make_client():
    import anthropic

    return anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=2, timeout=60)


def suggest(client, products: list[Product], title: str, price: str | None) -> dict | None:
    """Un apel: titlul -> sugestie validată de schemă. None dacă modelul refuză sau răspunsul nu se poate folosi."""
    response = client.beta.messages.create(
        model=settings.ai_model,
        max_tokens=1024,
        # dacă modelul principal refuză o cerere, API-ul o reia singur pe un model de rezervă
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        # clasificare scurtă: efort mic (mai ieftin și mai rapid)
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema([p.slug for p in products])}},
        system=[{"type": "text", "text": SYSTEM + catalog_text(products), "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"Titlu: {title}\nPreț: {price or 'necunoscut'} lei"}],
    )
    if response.stop_reason == "refusal":
        return None
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    slug = data.get("product_slug")
    return {
        "product_slug": None if slug == "none" else slug,
        "is_bundle": bool(data.get("is_bundle")),
        "confidence": max(0.0, min(1.0, float(data.get("confidence") or 0))),
        "reason": str(data.get("reason") or "")[:300],
        "model": response.model,
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


def run_pending(session: Session, limit: int | None = None, client=None) -> dict:
    """Cere sugestii pentru anunțurile nepotrivite care n-au încă una (cel mult `limit` pe rulare)."""
    stats = {"asked": 0, "suggested": 0, "none": 0, "failed": 0}
    if client is None:
        if not enabled():
            return stats
        client = make_client()
    import anthropic

    products = list(session.scalars(select(Product)))
    known = {p.slug for p in products}
    rows = [r for r in session.scalars(select(UnmatchedListing).order_by(UnmatchedListing.scraped_at.desc())) if "ai" not in r.raw]
    for row in rows[: limit or settings.ai_batch_size]:
        stats["asked"] += 1
        try:
            result = suggest(client, products, row.title, row.raw.get("price"))
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as exc:
            log.warning(json.dumps({"event": "ai_failed", "row": row.id, "error": str(exc)[:200]}))
            stats["failed"] += 1
            if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.RateLimitError)):
                break  # cheie greșită sau limită atinsă: nu insistăm la fiecare rând
            continue
        if result is None or (result["product_slug"] and result["product_slug"] not in known):
            # nu-l mai întrebăm la fiecare rulare: rămâne pentru verificarea de mână
            result = {"product_slug": None, "is_bundle": False, "confidence": 0.0, "reason": "Fără un răspuns folosibil.",
                      "model": settings.ai_model, "at": datetime.now(UTC).isoformat(timespec="seconds")}
            stats["failed"] += 1
        else:
            stats["suggested" if result["product_slug"] else "none"] += 1
        row.raw = {**row.raw, "ai": result}
        session.commit()
    log.info(json.dumps({"event": "ai_done", **stats}))
    return stats
