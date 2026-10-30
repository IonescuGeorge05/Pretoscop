"""„Am găsit mai ieftin”: prețuri semnalate de cititori, verificate de mână în admin.

Așa acoperim și magazinele care nu ne lasă robotul: prețul l-a văzut un om, iar noi doar verificăm linkul.
Un raport acceptat apare pe pagina produsului 7 zile, marcat ca semnalat de cititori, separat de comparație."""

import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, UserReport
from scrapers.jsonld import parse_price

SHOW_FOR = timedelta(days=7)


class ReportError(ValueError):
    """Raport invalid (mesajul se arată vizitatorului)."""


def parse_report(product: Product, url: str, price: str | float) -> tuple[str, str, Decimal]:
    url = url.strip()
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or "." not in parts.netloc:
        raise ReportError("Pune linkul complet spre pagina produsului (https://…).")
    value = parse_price(price)
    if value is None:
        raise ReportError("Prețul nu pare un număr.")
    msrp = product.msrp_ron
    # un preț nou sub 30% sau peste 300% din MSRP e aproape sigur o greșeală (alt produs, rată lunară, accesoriu)
    if value <= 0 or (msrp and not (msrp * Decimal("0.3") <= value <= msrp * 3)):
        raise ReportError("Prețul nu pare al acestui produs (prea mic sau prea mare).")
    domain = parts.netloc.lower().removeprefix("www.")
    return url, domain, value.quantize(Decimal("0.01"))


def create(session: Session, product: Product, url: str, price, note: str | None) -> UserReport:
    url, domain, value = parse_report(product, url, price)
    since = datetime.now(UTC) - timedelta(days=1)
    dup = session.scalar(
        select(UserReport).where(UserReport.url == url, UserReport.price == value, UserReport.created_at >= since)
    )
    if dup is not None:
        return dup
    report = UserReport(
        product_id=product.id,
        url=url,
        domain=domain,
        price=value,
        note=(note or "").strip()[:300] or None,
        created_at=datetime.now(UTC),
    )
    session.add(report)
    session.commit()
    return report


def visible(session: Session, product: Product) -> list[UserReport]:
    since = datetime.now(UTC) - SHOW_FOR
    return list(
        session.scalars(
            select(UserReport)
            .where(UserReport.product_id == product.id, UserReport.status == "accepted", UserReport.reviewed_at >= since)
            .order_by(UserReport.price)
        )
    )


class RateLimit:
    """Plafon simplu în memorie, per IP: formularele publice nu pot fi folosite pentru spam."""

    def __init__(self, per_hour: int):
        self.per_hour = per_hour
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= self.per_hour:
            return False
        q.append(now)
        return True
