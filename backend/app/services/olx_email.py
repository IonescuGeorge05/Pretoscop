"""Anunțuri OLX din alertele pe email ale căutărilor salvate (OLX blochează colectarea automată de pe site).

Datele vin de la OLX, în căsuța de email a utilizatorului: pe olx.ro salvezi căutarea (ex. „ps5”) cu notificări
pe email, iar aici citim prin IMAP emailurile recente de la OLX și extragem anunțurile. Nu se face nicio cerere
către OLX. Căsuța nu se modifică: emailurile procesate se țin minte în tabelul processed_emails.

    python -m app.services.olx_email      # o rulare (worker-ul o face automat dacă IMAP_USER e setat)

Formatul emailurilor OLX nu e documentat: parserul caută linkurile către olx.ro și cel mai apropiat preț în lei.
"""

import email
import hashlib
import imaplib
import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from email.message import Message
from email.policy import default as default_policy

from selectolax.parser import HTMLParser
from sqlalchemy import select

from app.config import imap_server, settings
from app.db import SessionLocal
from app.models import ProcessedEmail, Shop
from app.services.scrape_runner import ingest_offers
from scrapers.base import ScrapedOffer
from scrapers.jsonld import parse_price

log = logging.getLogger("olx_email")

PRICE_RE = re.compile(r"([\d][\d .]*(?:,\d{1,2})?)\s*(?:lei|ron)", re.I)
LOOKBACK_DAYS = 7  # emailuri mai vechi au anunțuri probabil deja vândute


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


ALERT_SUBJECT_RE = re.compile(r"(?i)anun[tț]uri noi")
CARD_MARKER = "explorează"
# rânduri din alertă care nu fac parte din cardurile de anunț
NOISE_RE = re.compile(r"(?i)^(anun[tț] selectat|mai multe anun[tț]uri.*|toate|\d+|explorează)$")


def _visible_lines(html: str) -> list[str]:
    tree = HTMLParser(html)
    for node in tree.css("style, script, head"):
        node.decompose()
    body = tree.body or tree.root
    lines = [re.sub(r"[\s\u034f\u200c\ufeff]+", " ", line).strip() for line in body.text(separator="\n").split("\n")]
    return [line for line in lines if line]


def _search_url(title: str) -> str:
    """Link public către căutarea OLX după titlu (link-urile din email sunt de tracking, legate de contul tău)."""
    slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", title.rstrip(".").lower()).encode("ascii", "ignore").decode()).strip("-")
    return f"https://www.olx.ro/oferte/q-{'-'.join(slug.split('-')[:8])}/"


def parse_olx_alert(html: str, received_at: datetime | None = None) -> list[ScrapedOffer]:
    """Alerta „Anunțuri noi în filtrele tale”: carduri titlu / preț / oraș, fiecare urmat de „Explorează”."""
    lines = _visible_lines(html)
    now = datetime.now(UTC)
    offers: list[ScrapedOffer] = []
    card: list[str] = []
    for line in lines:
        if line.lower() != CARD_MARKER:
            card.append(line)
            continue
        fields = [c for c in card[-4:] if not NOISE_RE.match(c)][-3:]  # ultimele rânduri dinaintea „Explorează”
        card = []
        price_line = next((c for c in fields if PRICE_RE.fullmatch(c)), None)
        rest = [c for c in fields if c != price_line]
        if not price_line or not rest:
            continue
        title, location = rest[0], (rest[1] if len(rest) > 1 else None)
        key = hashlib.sha1(f"{title}|{location}".encode()).hexdigest()[:12]
        offers.append(
            ScrapedOffer(
                shop_slug="olx",
                url=f"{_search_url(title)}#alerta-{key}",  # unic per anunț (titlu + oraș), fără date de tracking
                title=title,
                price=parse_price(PRICE_RE.fullmatch(price_line).group(1)),
                old_price=None,
                in_stock=True,
                ean=None,
                mpn=None,
                warranty_months=0,
                condition="used",
                scraped_at=now,
                raw={"source": "email", "truncated_title": title.endswith("...")},
                seller="persoană fizică",
                location=location,
                posted_label=f"din alerta OLX ({received_at:%d.%m.%Y})" if received_at else "din alerta OLX",
            )
        )
    return offers


def parse_email(subject: str, html: str, received_at: datetime | None = None) -> list[ScrapedOffer]:
    """Doar alertele de căutare; mesajele, resetările de parolă și reclamele OLX se ignoră."""
    if not ALERT_SUBJECT_RE.search(subject or ""):
        return []
    return parse_olx_alert(html, received_at) or parse_olx_email(html)


def _html_body(msg: Message) -> str | None:
    part = msg.get_body(preferencelist=("html",)) if hasattr(msg, "get_body") else None
    return part.get_content() if part is not None else None


def test_connection() -> dict:
    """Pentru /admin: se poate loga? câte emailuri OLX sunt? (doar citire)"""
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


@dataclass
class AlertEmail:
    message_id: str
    subject: str
    received_at: datetime | None
    html: str


def fetch_recent_emails(days: int = LOOKBACK_DAYS) -> list[AlertEmail]:
    """Emailurile de la OLX din ultimele `days` zile. Doar citire: căsuța rămâne neschimbată (nimic marcat citit)."""
    since = (datetime.now(UTC) - timedelta(days=days)).strftime("%d-%b-%Y")
    out: list[AlertEmail] = []
    with imaplib.IMAP4_SSL(imap_server(settings)) as imap:
        imap.login(settings.imap_user, settings.imap_password)
        imap.select(settings.imap_folder, readonly=True)
        _, data = imap.search(None, "SINCE", since, "FROM", f'"{settings.olx_alert_sender}"')
        for num in data[0].split():
            _, parts = imap.fetch(num, "(BODY.PEEK[])")  # PEEK: nu setează \\Seen
            msg = email.message_from_bytes(parts[0][1], policy=default_policy)
            html = _html_body(msg)
            if not html:
                continue
            try:
                received = parsedate_to_datetime(msg["Date"]) if msg["Date"] else None
            except (TypeError, ValueError):
                received = None
            out.append(
                AlertEmail(
                    message_id=(msg["Message-ID"] or f"{num.decode()}-{msg['Date']}").strip(),
                    subject=str(msg["Subject"] or ""),
                    received_at=received,
                    html=html,
                )
            )
    return out


def preview(days: int = LOOKBACK_DAYS) -> dict:
    """Pentru verificare: ce emailuri OLX recente sunt și ce anunțuri s-ar extrage, fără a salva nimic."""
    emails = fetch_recent_emails(days)
    items = []
    for e in emails:
        offers = parse_email(e.subject, e.html, e.received_at)
        items.append({
            "subject": e.subject,
            "received_at": e.received_at.isoformat() if e.received_at else None,
            "offers": len(offers),
            "sample": [{"title": o.title, "price": str(o.price), "location": o.location} for o in offers[:4]],
        })
    return {"days": days, "emails": len(emails), "items": items}


def run() -> dict:
    summary: dict = {"event": "olx_email_done"}
    if not settings.imap_user:
        summary["status"] = "not_configured"
        return summary
    emails = fetch_recent_emails()
    with SessionLocal() as session:
        done = set(session.scalars(select(ProcessedEmail.message_id)))
        new = [e for e in emails if e.message_id not in done]
        offers = []
        for e in new:
            found = parse_email(e.subject, e.html, e.received_at)
            offers.extend(found)
            session.add(ProcessedEmail(message_id=e.message_id, subject=e.subject, received_at=e.received_at,
                                       offers_found=len(found), processed_at=datetime.now(UTC)))
        shop = session.scalar(select(Shop).where(Shop.slug == "olx"))
        stats = ingest_offers(session, shop, offers)
        session.commit()
    summary.update(stats, status="ok", emails_recent=len(emails), emails_new=len(new), offers_parsed=len(offers))
    log.info(json.dumps(summary, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    print(run())
