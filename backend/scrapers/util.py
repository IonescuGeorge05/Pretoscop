def iphone18pro_link(url: str) -> bool:
    return "iphone-18-pro" in url.lower()


def ps5_link(url: str) -> bool:
    u = url.lower()
    return "playstation-5" in u or "ps5" in u
