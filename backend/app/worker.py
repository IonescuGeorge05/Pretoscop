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
    """Magazinele cu scraper dedicat + cele configurate în shops.yaml cu `crawl` sau `feed`."""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Shop

    with SessionLocal() as session:
        configured = [s.slug for s in session.scalars(select(Shop)) if s.crawl or (s.feed and s.feed.get("url"))]
    return list(dict.fromkeys([*REGISTRY, *configured]))


def main() -> None:
    if not settings.scraping_enabled:
        log.info("SCRAPING_ENABLED=false — worker-ul nu programează nimic")
        BlockingScheduler().start()  # rămâne pornit, fără joburi
        return

    scheduler = BlockingScheduler(timezone=UTC)
    jitter_s = settings.scrape_jitter_minutes * 60
    for slug in all_scrapable_shops():
        # primul run eșalonat (1-10 min după pornire), apoi la fiecare N ore +/- jitter
        first = datetime.now(UTC) + timedelta(seconds=random.randint(60, 600))
        scheduler.add_job(
            run_shop,
            IntervalTrigger(hours=settings.scrape_interval_hours, jitter=jitter_s, start_date=first),
            args=[slug],
            kwargs={"skip_blocked": True},
            id=f"scrape-{slug}",
            next_run_time=first,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )
        log.info("programat scrape-%s, primul run la %s", slug, first.strftime("%H:%M:%S"))
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
