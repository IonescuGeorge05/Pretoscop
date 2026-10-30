"""Familiile urmărite, din punctul de vedere al scraperilor: ce URL-uri și ce titluri merită citite.

Familie nouă = o intrare aici (URL + titlu), o funcție în matcher.py, produsele în seed/models.yaml și familia în
seed/families.yaml. Filtrele de aici doar economisesc cereri; decizia finală o ia matcher-ul.
"""

import re

# URL-uri de produs per familie. La PS5 cerem semne de consolă (altfel trec jocuri, volane, videoproiectoare
# „compatibile PS5”); la telefoane, modelul exact.
URL_RES: dict[str, re.Pattern] = {
    "ps5": re.compile(
        r"(?i)(consol|console).*(play-?station-?5|ps-?5)|(play-?station-?5|ps-?5).*(consol|console)"
        r"|(play-?station-?5|ps-?5)-(slim|pro|digital|disc|disk|standard)"
    ),
    "switch2": re.compile(r"(?i)switch-?2(?!\d)"),
    "xbox": re.compile(r"(?i)(consol|console).*xbox-?series|xbox-?series-?[xs]-(digital|512|1-?tb|1000|robot|carbon)"),
    "iphone": re.compile(r"(?i)iphone-?18-?pro"),
    "galaxy": re.compile(r"(?i)s26-?ultra"),
}

# titluri (feed-uri) din familiile urmărite, înainte de matcher: feed-urile au tot catalogul magazinului
TITLE_RE = re.compile(r"(?i)\b(ps ?5|playstation ?5|iphone ?18|switch ?2\b|xbox series|s26 ultra)")


def url_family(url: str) -> str | None:
    return next((name for name, rx in URL_RES.items() if rx.search(url)), None)


def interleave(urls: list[str]) -> list[str]:
    """Ordine alternată pe familii: plafonul de pagini per rulare nu se consumă doar pe culorile unui singur telefon."""
    groups: dict[str | None, list[str]] = {}
    for u in urls:
        groups.setdefault(url_family(u), []).append(u)
    out: list[str] = []
    lists = list(groups.values())
    for i in range(max((len(g) for g in lists), default=0)):
        out += [g[i] for g in lists if i < len(g)]
    return out
