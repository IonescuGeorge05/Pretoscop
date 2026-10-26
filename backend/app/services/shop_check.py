"""Verifică dacă un magazin descoperit poate fi citit politicos: robots.txt, sitemap, date structurate pe produs."""

from datetime import UTC, datetime

import httpx

from scrapers.base import BlockedError, PoliteClient, RobotsDisallowed, agent_token
from scrapers.jsonld import extract_microdata, extract_product


def check_shop(example_url: str) -> dict:
    result: dict = {"checked_at": datetime.now(UTC).isoformat(timespec="seconds")}
    client = PoliteClient(retries=2)  # toate cererile trec prin pauzele dintre cereri (3-5 s / domeniu)
    try:
        robots = client._robots_for(example_url)
        result["sitemaps"] = robots.sitemaps[:3]
        result["robots_allows_example"] = robots.allowed(agent_token(), example_url)
        page = client.get(example_url)
        data = extract_product(page.text) or extract_microdata(page.text)
        result["page_status"] = page.status_code
        result["structured_data"] = bool(data and data.get("price"))
        if data:
            result["sample"] = {"title": data.get("title"), "price": str(data.get("price")), "in_stock": data.get("in_stock")}
        platform = next((p for p in ("shopify", "woocommerce", "gomag", "merchantpro", "prestashop", "opencart", "magento")
                         if p in page.text.lower()), None)
        result["platform"] = platform
        result["verdict"] = "ok" if result["structured_data"] and result["robots_allows_example"] else "partial"
    except BlockedError as exc:
        result.update(verdict="blocked", error=str(exc))
    except RobotsDisallowed:
        result.update(verdict="robots_disallow")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            result.update(verdict="rate_limited", error="Magazinul limitează cererile (429); reîncearcă mai târziu.")
        else:
            result.update(verdict="error", error=f"HTTP {exc.response.status_code}")
    except httpx.HTTPError as exc:
        result.update(verdict="error", error=f"{type(exc).__name__}: {exc}")
    finally:
        client.close()
    return result
