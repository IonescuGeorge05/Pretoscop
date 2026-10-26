"""Anunțuri OLX din alertele pe email ale căutărilor salvate (OLX blochează colectarea automată de pe site).

Datele vin de la OLX, în căsuța de email a utilizatorului: pe olx.ro salvezi căutarea (ex. „ps5”) cu notificări
pe email, iar aici citim prin IMAP emailurile necitite de la OLX și extragem anunțurile. Nu se face nicio cerere
către OLX. Emailurile procesate sunt marcate citite.

    python -m app.services.olx_email      # o rulare (worker-ul o face automat dacă IMAP_USER e setat)

Formatul emailurilor OLX nu e documentat: parserul caută linkurile către olx.ro și cel mai apropiat preț în lei.
"""

import email
import imaplib
import json
import logging
import re
from datetime import UTC, datetime
from email.message import Message
from email.policy import default as default_policy

from selectolax.parser import HTMLParser
from sqlalchemy import select

from app.config import imap_server, settings
from app.db import SessionLocal
from app.models import Shop
from app.services.scrape_runner import ingest_offers
from scrapers.base import ScrapedOffer
from scrapers.jsonld import parse_price

log = logging.getLogger("olx_email")

PRICE_RE = re.compile(r"([\d][\d .]*(?:,\d{1,2})?)\s*lei", re.I)


# pagini OLX care nu sunt anunțuri (cont, setări, dezabonare, aplicație)
NON_LISTING_RE = re.compile(r"olx\.ro/(cont|myaccount|account|setari|unsubscribe|dezabonare|app|ajutor|help)", re.I)


def _listing_url(href: str) -> str | None:
    if "olx.ro" not in href or NON_LISTING_RE.search(href):
        return None
    if "/d/oferta/" in href:
        return href.split("?")[0]
    host = href.split("/")[2] if href.count("/") >= 2 else ""
    return href if host not in ("www.olx.ro", "olx.ro") else None  # link de tracking (ex. click.olx.ro/...)


def parse_olx_email(html: str) -> list[ScrapedOffer]:
    now = datetime.now(UTC)
    found: dict[str, ScrapedOffer] = {}
    for a in HTMLParser(html).css("a[href]"):
        url = _listing_url(a.attributes.get("href") or "")
        if url is None or url in found:
            continue
        # urcăm în blocuri tot mai mari până găsim titlul și prețul, dar ne oprim înainte de blocul cu alt anunț
        block, title, price = a, None, None
        for _ in range(6):
            if block.parent is None:
                break
            parent = block.parent
            urls = {u for n in parent.css("a[href]") if (u := _listing_url(n.attributes.get("href") or ""))}
            if urls - {url}:
                break
            block = parent
            texts = [n.text(strip=True) for n in block.css("a[href]") if _listing_url(n.attributes.get("href") or "") == url]
            candidates = [t for t in texts if len(t) > 8 and not PRICE_RE.fullmatch(t)]
            title = title or (max(candidates, key=len) if candidates else None)
            m = PRICE_RE.search(block.text(separator=" "))
            if m and parse_price(m.group(1)):
                price = parse_price(m.group(1))
            if title and price:
                break
        if title and price:
            found[url] = ScrapedOffer(
                shop_slug="olx",
                url=url,
                title=title,
                price=price,
                old_price=None,
                in_stock=True,
                ean=None,
                mpn=None,
                warranty_months=0,
                condition="used",
                scraped_at=now,
                raw={"source": "email"},
                seller="persoană fizică",
            )
    return list(found.values())


def _html_body(msg: Message) -> str | None:
    part = msg.get_body(preferencelist=("html",)) if hasattr(msg, "get_body") else None
    return part.get_content() if part is not None else None


def test_connection() -> dict:
    """Pentru /admin: se poate loga? câte emailuri OLX necitite sunt? (nu marchează nimic citit)"""
    if not settings.imap_user:
        return {"ok": False, "error": "IMAP_USER nu e setat în .env"}
    try:
        with imaplib.IMAP4_SSL(imap_server(settings)) as imap:
            imap.login(settings.imap_user, settings.imap_password)
            imap.select(settings.imap_folder, readonly=True)
            _, unseen = imap.search(None, "UNSEEN", "FROM", f'"{settings.olx_alert_sender}"')
            _, total = imap.search(None, "FROM", f'"{settings.olx_alert_sender}"')
        return {"ok": True, "user": settings.imap_user, "server": imap_server(settings), "olx_unread": len(unseen[0].split()), "olx_total": len(total[0].split())}
    except (imaplib.IMAP4.error, OSError) as exc:
        error = f"{type(exc).__name__}: {exc}"
        hint = (
            "Parola trebuie să fie o „parolă pentru aplicații” creată din setările de securitate ale contului "
            "(Gmail/Yahoo/Outlook), nu parola obișnuită."
            if "AUTHENTICATIONFAILED" in error.upper() or "invalid credentials" in error.lower()
            else None
        )
        return {"ok": False, "server": imap_server(settings), "error": error, "hint": hint}


def fetch_alert_emails() -> list[str]:
    """HTML-ul emailurilor necitite de la OLX; le marchează citite."""
    bodies: list[str] = []
    with imaplib.IMAP4_SSL(imap_server(settings)) as imap:
        imap.login(settings.imap_user, settings.imap_password)
        imap.select(settings.imap_folder)
        _, data = imap.search(None, "UNSEEN", "FROM", f'"{settings.olx_alert_sender}"')
        for num in data[0].split():
            _, parts = imap.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(parts[0][1], policy=default_policy)
            if body := _html_body(msg):
                bodies.append(body)
            imap.store(num, "+FLAGS", "\\Seen")
    return bodies


def run() -> dict:
    summary: dict = {"event": "olx_email_done"}
    if not settings.imap_user:
        summary["status"] = "not_configured"
        return summary
    offers = [o for body in fetch_alert_emails() for o in parse_olx_email(body)]
    with SessionLocal() as session:
        shop = session.scalar(select(Shop).where(Shop.slug == "olx"))
        stats = ingest_offers(session, shop, offers)
        session.commit()
    summary.update(stats, status="ok")
    log.info(json.dumps(summary, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    print(run())
