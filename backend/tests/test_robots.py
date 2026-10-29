from scrapers.robots import Robots

PUBLI24 = """
User-agent: ClaudeBot
Allow: /

User-agent: Baiduspider
Disallow: /

User-agent: *
Disallow: /arhiva/anunturi/
Disallow: /Search/
Disallow: /anunturi/?
Allow: /
"""


def test_trailing_question_mark_is_literal_not_dropped():
    r = Robots(PUBLI24)
    assert r.allowed("PretoscopBot", "https://www.publi24.ro/anunturi/electronice/console-jocuri/")
    assert r.allowed("PretoscopBot", "https://www.publi24.ro/anunturi/electronice/console-jocuri/?q=ps5")
    assert not r.allowed("PretoscopBot", "https://www.publi24.ro/anunturi/?q=ps5")
    assert not r.allowed("PretoscopBot", "https://www.publi24.ro/Search/?q=ps5")


def test_specific_group_overrides_star():
    r = Robots(PUBLI24)
    assert not r.allowed("Baiduspider", "https://www.publi24.ro/anunturi/electronice/")


def test_wildcards_and_end_anchor():
    r = Robots("User-agent: *\nDisallow: /*?q=\nDisallow: */filtre/*/*/*\nDisallow: /*.php$\n")
    assert not r.allowed("x", "https://www.evomag.ro/console/?q=ps5")
    assert not r.allowed("x", "https://www.flanco.ro/gaming/filtre/a/b/c")
    assert r.allowed("x", "https://www.flanco.ro/gaming/filtre/a")
    assert not r.allowed("x", "https://x.ro/index.php")
    assert r.allowed("x", "https://x.ro/index.php?a=1")


def test_longest_match_wins_and_allow_wins_ties():
    r = Robots("User-agent: *\nDisallow: /a/\nAllow: /a/b/\nDisallow: /c/\nAllow: /c/\n")
    assert not r.allowed("x", "https://x.ro/a/z")
    assert r.allowed("x", "https://x.ro/a/b/z")
    assert r.allowed("x", "https://x.ro/c/z")


def test_empty_disallow_and_missing_file():
    assert Robots("User-agent: *\nDisallow:\n").allowed("x", "https://x.ro/anything")
    assert Robots(allow_all=True).allowed("x", "https://x.ro/")
    assert not Robots(disallow_all=True).allowed("x", "https://x.ro/")


def test_emag_511_captcha_page_stops_the_run():
    """eMAG (AWS WAF) răspunde 511 cu o pagină CAPTCHA: trebuie să oprim rularea, nu să continuăm pagină cu pagină."""
    import httpx
    import pytest

    from scrapers.base import BlockedError, PoliteClient

    captcha = '<html><head><title>eMAG Captcha</title></head><body>Am detectat trafic neobișnuit</body></html>'

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        return httpx.Response(511, text=captcha)

    client = PoliteClient(min_delay=0, max_delay=0, transport=httpx.MockTransport(handler))
    with pytest.raises(BlockedError):
        client.get("https://www.emag.ro/x/pd/ABC/")


def test_user_agent_names_the_bot_and_links_its_page():
    from scrapers.base import user_agent

    ua = user_agent()
    assert "PretoscopBot/0.2" in ua and "+https://" in ua and "@" not in ua  # fără adrese de email în cereri


def test_restart_does_not_rescrape_before_the_interval():
    from datetime import UTC, datetime, timedelta

    from app.worker import first_run_at

    now = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    six = timedelta(hours=6)
    assert first_run_at(now - timedelta(hours=1), now, six) == now + timedelta(hours=5)  # a rulat acum o oră
    assert now < first_run_at(now - timedelta(days=2), now, six) <= now + timedelta(minutes=10)  # restanță
    assert now < first_run_at(None, now, six) <= now + timedelta(minutes=10)  # niciodată
