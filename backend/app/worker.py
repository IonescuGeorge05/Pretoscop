"""Worker: APScheduler rulează fiecare scraper la SCRAPE_INTERVAL_HOURS, cu jitter aleator per magazin."""

import logging
import random
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.services import olx_email, web_search
from app.services.scrape_runner import run_shop
from scrapers.registry import REGISTRY

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("worker")


def all_scrapable_shops() -> list[str]:
    """Magazinele cu scraper dedicat + cele configurate în shops.yaml cu `crawl` sau `feed` (doar cele pornite)."""
    return list(last_runs())


BOOST_EVENTS = {"black_friday", "singles_day"}


def default_interval(today=None) -> float:
    """Intervalul implicit: mai des cât ține o campanie mare din calendar, ca istoricul să prindă fiecare schimbare.
    Magazinele cu interval propriu (ex. evoMAG la 12 ore, ca să nu ne blocheze) nu sunt afectate."""
    from recommender.calendar import load_calendar

    today = today or datetime.now(UTC).date()
    if any(e.slug in BOOST_EVENTS and e.start <= today <= e.end for e in load_calendar()):
        return min(settings.scrape_interval_hours, settings.event_scrape_interval_hours)
    return settings.scrape_interval_hours


def last_runs() -> dict[str, tuple[datetime | None, float]]:
    """slug -> (ultima rulare, intervalul în ore), pentru magazinele care se pot citi și sunt pornite (`enabled`)."""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Shop

    with SessionLocal() as session:
        shops = {s.slug: s for s in session.scalars(select(Shop))}
    slugs = [*REGISTRY, *(s.slug for s in shops.values() if s.crawl or (s.feed and s.feed.get("url")))]
    default = default_interval()
    return {
        slug: (shops[slug].last_scraped_at, shops[slug].interval_hours or default) if slug in shops else (None, default)
        for slug in dict.fromkeys(slugs)
        if slug not in shops or shops[slug].enabled
    }


def first_run_at(last: datetime | None, now: datetime, interval: timedelta) -> datetime:
    """Prima rulare după pornirea worker-ului: niciodată mai devreme decât `ultima rulare + interval`.
    Altfel fiecare restart / rebuild ar citi din nou toate magazinele (așa am ajuns la CAPTCHA-ul eMAG)."""
    soon = now + timedelta(seconds=random.randint(60, 600))  # eșalonat, ca magazinele să nu pornească odată
    if last is None:
        return soon
    last = last if last.tzinfo else last.replace(tzinfo=UTC)
    return max(soon, last + interval)


def schedule_shop(scheduler, slug: str, last: datetime | None, hours: float | None = None) -> datetime:
    hours = hours or settings.scrape_interval_hours
    first = first_run_at(last, datetime.now(UTC), timedelta(hours=hours))
    scheduler.add_job(
        run_shop,
        IntervalTrigger(hours=hours, jitter=settings.scrape_jitter_minutes * 60, start_date=first),
        args=[slug],
        kwargs={"skip_blocked": True},
        id=f"scrape-{slug}",
        next_run_time=first,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
        replace_existing=True,
    )
    return first


def sync_schedule(scheduler) -> None:
    """Adaugă în program magazinele devenite citibile între timp (feed pus din admin, magazin nou) și schimbă
    intervalul celor existente când începe / se termină o campanie mare."""
    for slug, (last, hours) in last_runs().items():
        job = scheduler.get_job(f"scrape-{slug}")
        if job is None:
            first = schedule_shop(scheduler, slug, last, hours)
            log.info("magazin nou în program: scrape-%s, primul run la %s", slug, first.strftime("%H:%M:%S"))
        elif job.trigger.interval != timedelta(hours=hours):
            first = schedule_shop(scheduler, slug, last, hours)
            log.info("interval nou: scrape-%s la %s ore, următorul run la %s", slug, hours, first.strftime("%H:%M:%S"))


def run_alerts() -> None:
    from app.db import SessionLocal
    from app.services import alerts

    with SessionLocal() as session:
        alerts.check_all(session)


def run_ai_suggestions() -> None:
    from app.db import SessionLocal
    from app.services import ai_suggest

    with SessionLocal() as session:
        ai_suggest.run_pending(session)


def main() -> None:
    if not settings.scraping_enabled:
        log.info("SCRAPING_ENABLED=false — worker-ul nu programează nimic")
        BlockingScheduler().start()  # rămâne pornit, fără joburi
        return

    # după un rebuild regulile matcher-ului pot fi altele: anunțurile nepotrivite trec din nou prin ele (doar baza de date)
    try:
        from app.db import SessionLocal
        from app.services.scrape_runner import rematch_unmatched

        with SessionLocal() as session:
            rematch_unmatched(session)
    except Exception:
        log.exception("re-potrivirea anunțurilor nepotrivite a eșuat")

    scheduler = BlockingScheduler(timezone=UTC)
    for slug, (last, hours) in last_runs().items():
        # primul run: după intervalul de la ultima rulare (sau în 1-10 min dacă n-a rulat niciodată), apoi la N ore +/- jitter
        first = schedule_shop(scheduler, slug, last, hours)
        log.info("programat scrape-%s la %s ore, primul run la %s", slug, hours, first.strftime("%H:%M:%S"))
    if settings.imap_user:
        scheduler.add_job(
            olx_email.run,
            IntervalTrigger(minutes=settings.email_poll_minutes),
            id="olx-email",
            next_run_time=datetime.now(UTC) + timedelta(minutes=2),
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )
        log.info("alerte OLX pe email: verificare la fiecare %d minute", settings.email_poll_minutes)
    # magazine noi / feed-uri puse din admin intră în program fără repornirea worker-ului
    scheduler.add_job(
        sync_schedule,
        IntervalTrigger(minutes=30),
        args=[scheduler],
        id="sync-schedule",
        max_instances=1,
        coalesce=True,
    )

    if settings.anthropic_api_key:
        # sugestii AI pentru anunțurile nepotrivite: o dată pe oră, doar cele care n-au încă una
        scheduler.add_job(
            run_ai_suggestions,
            IntervalTrigger(hours=1),
            id="ai-suggestions",
            next_run_time=datetime.now(UTC) + timedelta(minutes=4),
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )
        log.info("sugestii AI pornite (%s), cel mult %d anunțuri pe oră", settings.ai_model, settings.ai_batch_size)

    # alerte de preț / stoc pe email (doar baza de date + SMTP; nicio cerere către magazine)
    scheduler.add_job(
        run_alerts,
        IntervalTrigger(minutes=settings.alert_check_minutes),
        id="price-alerts",
        next_run_time=datetime.now(UTC) + timedelta(minutes=3),
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )
    if settings.brave_api_key:
        scheduler.add_job(
            web_search.run_olx_search,
            IntervalTrigger(hours=settings.search_interval_hours),
            id="olx-search",
            next_run_time=datetime.now(UTC) + timedelta(minutes=5),
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            web_search.run_discovery,
            IntervalTrigger(days=settings.discovery_interval_days),
            id="shop-discovery",
            next_run_time=datetime.now(UTC) + timedelta(minutes=8),
            max_instances=1,
            coalesce=True,
            misfire_grace_time=86400,
        )
        log.info("căutare web: OLX la %s ore, descoperire magazine la %s zile", settings.search_interval_hours, settings.discovery_interval_days)
    scheduler.start()


if __name__ == "__main__":
    main()
