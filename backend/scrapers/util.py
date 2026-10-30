from scrapers.families import URL_RES


def iphone18pro_link(url: str) -> bool:
    return bool(URL_RES["iphone"].search(url))


def iphone17_link(url: str) -> bool:
    return bool(URL_RES["iphone17"].search(url))


def ps5_link(url: str) -> bool:
    u = url.lower()
    return "playstation-5" in u or "ps5" in u


def switch2_link(url: str) -> bool:
    return bool(URL_RES["switch2"].search(url))


def xbox_link(url: str) -> bool:
    return bool(URL_RES["xbox"].search(url))


def galaxy_link(url: str) -> bool:
    return bool(URL_RES["galaxy"].search(url))
