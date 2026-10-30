"""Alerte pe email: „anunță-mă când prețul scade sub X” și „anunță-mă când apare în stoc”.

Fluxul: formular pe pagina produsului -> rând neconfirmat + email de confirmare (double opt-in, ca să nu poată
abona cineva adresa altcuiva) -> link de confirmare -> verificarea periodică din worker trimite emailul.
Fiecare email are link de dezabonare, care șterge rândul. Alertele neconfirmate se șterg după 48 de ore.
"""

import json
import logging
import re
import secrets
import smtplib
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from email.message import EmailMessage

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.families import family_slug
from app.models import PriceAlert, Product
from app.services import catalog

log = logging.getLogger("alerts")

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$", re.I)
MAX_ALERTS_PER_EMAIL = 20
UNCONFIRMED_TTL = timedelta(hours=48)
RESEND_AFTER = timedelta(hours=24)  # la o alertă de preț: cel mult un email pe zi, și doar dacă prețul a scăzut iar


class AlertError(ValueError):
    """Cerere invalidă (mesajul se arată vizitatorului)."""


def mail_enabled() -> bool:
    return bool(settings.smtp_host and (settings.mail_from or settings.smtp_user))


def send_email(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"{settings.app_name} <{settings.mail_from or settings.smtp_user}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def _site(path: str) -> str:
    return settings.public_site_url.rstrip("/") + path


def _product_url(p: Product) -> str:
    return _site(f"/{family_slug(p.family)}/{p.slug}")


def _lei(v: Decimal | float) -> str:
    return f"{float(v):,.0f}".replace(",", ".") + " lei"


def best_now(session: Session, product: Product) -> tuple[Decimal | None, str | None]:
    """Cel mai mic preț final în stoc (ofertele comparabile, ca „de la” de pe site) și magazinul."""
    offers = catalog.comparable(catalog.load_offers(session, product.id, catalog.resolve_source(None)))
    in_stock = [v for v in catalog.current_views(offers) if v.point.in_stock]
    if not in_stock:
        return None, None
    best = in_stock[0]
    return best.breakdown.final_price, best.offer.shop.name


def create(session: Session, email: str, product: Product, kind: str, target_price: Decimal | None) -> PriceAlert:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise AlertError("Adresa de email nu pare validă.")
    if kind == "price" and (target_price is None or target_price <= 0):
        raise AlertError("Alege prețul sub care vrei să fii anunțat.")
    if kind not in ("price", "stock"):
        raise AlertError("Tip de alertă necunoscut.")
    count = session.scalar(select(func.count(PriceAlert.id)).where(PriceAlert.email == email))
    if count >= MAX_ALERTS_PER_EMAIL:
        raise AlertError(f"Ai deja {MAX_ALERTS_PER_EMAIL} alerte pe această adresă.")
    alert = PriceAlert(
        email=email,
        product_id=product.id,
        kind=kind,
        target_price=target_price if kind == "price" else None,
        token=secrets.token_urlsafe(32),
        created_at=datetime.now(UTC),
    )
    session.add(alert)
    session.flush()
    what = f"prețul final scade sub {_lei(target_price)}" if kind == "price" else "apare în stoc"
    send_email(
        email,
        f"Confirmă alerta pentru {product.name}",
        f"Bună,\n\nCineva (sperăm că tu) a cerut pe {settings.app_name} un email când {product.name} {what}.\n\n"
        f"Confirmă alerta: {_site('/api/alerts/confirm?token=' + alert.token)}\n\n"
        "Dacă nu ai cerut tu, ignoră mesajul: fără confirmare, adresa se șterge automat în 48 de ore.\n",
    )
    session.commit()
    return alert


def confirm(session: Session, token: str) -> PriceAlert | None:
    alert = session.scalar(select(PriceAlert).where(PriceAlert.token == token))
    if alert is not None and alert.confirmed_at is None:
        alert.confirmed_at = datetime.now(UTC)
        session.commit()
    return alert


def unsubscribe(session: Session, token: str) -> bool:
    alert = session.scalar(select(PriceAlert).where(PriceAlert.token == token))
    if alert is None:
        return False
    session.delete(alert)
    session.commit()
    return True


def due(alert: PriceAlert, best: Decimal | None, now: datetime) -> bool:
    """Trebuie trimis emailul acum? (funcție pură, testată)"""
    if alert.confirmed_at is None or best is None:
        return False
    if alert.kind == "stock":
        return True  # o singură dată: după trimitere alerta se șterge
    if best > alert.target_price:
        return False
    if alert.last_sent_at is None:
        return True
    last = alert.last_sent_at if alert.last_sent_at.tzinfo else alert.last_sent_at.replace(tzinfo=UTC)
    return now - last >= RESEND_AFTER and best < alert.last_sent_price


def check_all(session: Session) -> dict:
    """Rulat periodic de worker: trimite alertele îndeplinite, șterge cele neconfirmate expirate."""
    now = datetime.now(UTC)
    stats = {"sent": 0, "expired": 0}
    stats["expired"] = session.execute(
        delete(PriceAlert).where(PriceAlert.confirmed_at.is_(None), PriceAlert.created_at < now - UNCONFIRMED_TTL)
    ).rowcount
    session.commit()
    if not mail_enabled():
        return stats
    cache: dict[int, tuple[Decimal | None, str | None]] = {}
    for alert in session.scalars(select(PriceAlert).where(PriceAlert.confirmed_at.is_not(None))):
        if alert.product_id not in cache:
            cache[alert.product_id] = best_now(session, alert.product)
        best, shop = cache[alert.product_id]
        if not due(alert, best, now):
            continue
        p = alert.product
        head = (
            f"{p.name} costă acum {_lei(best)} la {shop} (preț final, cu transport), sub ținta ta de {_lei(alert.target_price)}."
            if alert.kind == "price"
            else f"{p.name} e din nou în stoc: de la {_lei(best)} la {shop}."
        )
        try:
            send_email(
                alert.email,
                f"{p.name}: {_lei(best)}" if alert.kind == "price" else f"{p.name} e în stoc",
                f"{head}\n\nToate ofertele, istoricul și recomandarea: {_product_url(p)}\n\n"
                "Prețurile se pot schimba oricând; verifică pe site-ul magazinului înainte de comandă.\n\n"
                f"Nu mai vrei emailuri pentru acest produs? {_site('/api/alerts/unsubscribe?token=' + alert.token)}\n",
            )
        except (smtplib.SMTPException, OSError) as exc:
            log.warning(json.dumps({"event": "alert_send_failed", "alert": alert.id, "error": str(exc)}))
            continue
        if alert.kind == "stock":
            session.delete(alert)  # și-a îndeplinit rostul; nu păstrăm adresa
        else:
            alert.last_sent_at, alert.last_sent_price = now, best
        session.commit()
        stats["sent"] += 1
    log.info(json.dumps({"event": "alerts_checked", **stats}))
    return stats
