"""Parser robots.txt conform RFC 9309 (standardul folosit de Google).

Înlocuiește `urllib.robotparser`, care: (1) nu înțelege wildcard-urile `*` și `$`, deci ignoră reguli
ca `Disallow: /*?q=`; (2) taie un `?` final, transformând `Disallow: /anunturi/?` în `Disallow: /anunturi/`.
Reguli: se aplică grupul cu numele robotului nostru, altfel grupul `*`; câștigă regula cea mai lungă care
se potrivește, iar la egalitate `Allow`. `Crawl-delay` (nestandard, dar respectat de noi) e citit per grup.
"""

import re
from urllib.parse import unquote, urlsplit


def _pattern(path: str) -> re.Pattern:
    anchored = path.endswith("$")
    body = re.escape(unquote(path[:-1] if anchored else path)).replace(r"\*", ".*")
    return re.compile(body + ("$" if anchored else ""))


class Robots:
    def __init__(self, text: str = "", allow_all: bool = False, disallow_all: bool = False):
        self.allow_all, self.disallow_all = allow_all, disallow_all
        self.sitemaps = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", text)
        self.groups: list[tuple[set[str], list[tuple[bool, str, re.Pattern]]]] = []
        self.delays: list[tuple[set[str], float]] = []
        agents: set[str] = set()
        rules: list = []
        delay: float | None = None
        last_was_agent = False
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, value = (p.strip() for p in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if not last_was_agent and (agents or rules):
                    self._close(agents, rules, delay)
                    agents, rules, delay = set(), [], None
                agents.add(value.lower())
                last_was_agent = True
            elif key in ("allow", "disallow"):
                last_was_agent = False
                if value:  # „Disallow:” gol = totul permis
                    rules.append((key == "allow", value, _pattern(value)))
            elif key == "crawl-delay":
                last_was_agent = False
                try:
                    delay = float(value)
                except ValueError:
                    pass
            else:
                last_was_agent = False
        if agents or rules:
            self._close(agents, rules, delay)

    def _close(self, agents: set[str], rules: list, delay: float | None) -> None:
        self.groups.append((agents, rules))
        if delay is not None:
            self.delays.append((agents, delay))

    def crawl_delay(self, agent: str) -> float | None:
        """Pauza cerută între cereri (secunde) pentru robotul nostru; grupul specific are prioritate față de `*`."""
        agent = agent.lower()
        specific = [d for agents, d in self.delays if agent in agents]
        if specific or any(agent in agents for agents, _ in self.groups):
            return max(specific) if specific else None
        general = [d for agents, d in self.delays if "*" in agents]
        return max(general) if general else None

    def _rules_for(self, agent: str) -> list:
        agent = agent.lower()
        specific = [r for agents, r in self.groups if agent in agents]
        if specific:
            return [rule for r in specific for rule in r]
        return [rule for agents, r in self.groups if "*" in agents for rule in r]

    def allowed(self, agent: str, url: str) -> bool:
        if self.disallow_all:
            return False
        if self.allow_all:
            return True
        parts = urlsplit(url)
        target = unquote((parts.path or "/") + (f"?{parts.query}" if parts.query else ""))
        best: tuple[int, bool] | None = None
        for is_allow, path, pattern in self._rules_for(agent):
            if pattern.match(target):
                candidate = (len(path), is_allow)
                if best is None or candidate > best:  # mai lungă câștigă; la egalitate Allow (True > False)
                    best = candidate
        return True if best is None else best[1]
