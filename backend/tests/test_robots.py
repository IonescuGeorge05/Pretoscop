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
