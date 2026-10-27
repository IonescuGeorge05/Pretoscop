/**
 * robots.txt parser and matcher following RFC 9309 (and Google's reference implementation where
 * the RFC leaves room). Pure: no I/O.
 *
 * - Groups: one or more `user-agent` lines followed by rules; a `user-agent` line after an
 *   allow/disallow rule starts a new group (as in Google's reference parser, other lines such as
 *   `Crawl-delay` do not end a group). Rules before the first `user-agent` line are ignored.
 * - `Crawl-delay` (non-standard) applies only to the user-agent lines written above it in its
 *   group, so `User-agent: AhrefsBot / Crawl-delay: 10 / User-agent: *` gives `*` no delay.
 * - Group selection: the product token is extracted from each user-agent value (leading
 *   `[A-Za-z_-]` characters, so `PretoscopBot/1.0` -> `PretoscopBot`) and compared
 *   case-insensitively. All matching groups are combined. Without a match, the `*` groups apply;
 *   without those, nothing is disallowed. A generic value such as `bot/`, `crawl` or `spider`
 *   never matches `PretoscopBot`; such groups are reported (`ignoredGroups`) so the decision is
 *   visible per shop.
 * - Matching: `*` matches any sequence, `$` at the end anchors; the longest matching pattern
 *   (in octets) wins and `allow` wins ties. Paths and patterns are percent-normalized the same way.
 * - `/robots.txt` is always allowed. `Crawl-delay` (non-standard) and `Sitemap` are collected.
 */

export const ROBOTS_PARSE_LIMIT_BYTES = 512 * 1024;

export interface RobotsRule {
  allow: boolean;
  /** Percent-normalized pattern used for matching. */
  pattern: string;
  /** The value as written in the file. */
  raw: string;
  line: number;
}

export interface RobotsGroup {
  userAgents: string[];
  /** Crawl-delay in seconds per user-agent line (the first `Crawl-delay` below it), or null. */
  agentCrawlDelays: Array<number | null>;
  rules: RobotsRule[];
  line: number;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface RobotsGroupSelection {
  /** `PretoscopBot`, `PretoscopBot-Feed`, `*` or `none`. */
  label: string;
  via: 'product_token' | 'wildcard' | 'none';
  groups: RobotsGroup[];
  crawlDelaySec: number | null;
}

export interface IgnoredRobotsGroup {
  userAgent: string;
  reason: 'generic_fragment' | 'substring_of_our_user_agent' | 'other_pretoscop_token';
}

export interface RobotsEvaluation {
  allowed: boolean;
  /** The rule that decided, if any. */
  rule?: RobotsRule;
}

type Directive = 'user-agent' | 'allow' | 'disallow' | 'crawl-delay' | 'sitemap';

const DIRECTIVES: Record<string, Directive> = {
  'user-agent': 'user-agent',
  useragent: 'user-agent',
  'user agent': 'user-agent',
  allow: 'allow',
  disallow: 'disallow',
  dissallow: 'disallow',
  dissalow: 'disallow',
  disalow: 'disallow',
  diasllow: 'disallow',
  disallaw: 'disallow',
  'crawl-delay': 'crawl-delay',
  crawldelay: 'crawl-delay',
  'crawl delay': 'crawl-delay',
  sitemap: 'sitemap',
  'site-map': 'sitemap',
};

function splitKeyValue(line: string): { key: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon > 0) return { key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
  // Leniency (as Google): "Disallow /path" without a colon.
  const m = /^(\S+)\s+(\S+)$/.exec(line);
  return m ? { key: m[1] ?? '', value: m[2] ?? '' } : null;
}

/** Parses a robots.txt body. Content beyond `ROBOTS_PARSE_LIMIT_BYTES` characters is ignored. */
export function parseRobotsTxt(text: string, robotsUrl?: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let inAgentRun = false;
  // Crawl-delay bookkeeping for the current group: agents from `delayFrom` on have no delay yet;
  // `lastDelay` is the agent range the previous Crawl-delay line applied to.
  let delayFrom = 0;
  let lastDelay: [number, number] | null = null;
  const body = text.length > ROBOTS_PARSE_LIMIT_BYTES ? text.slice(0, ROBOTS_PARSE_LIMIT_BYTES) : text;
  const lines = body.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const hash = rawLine.indexOf('#');
    const line = (hash >= 0 ? rawLine.slice(0, hash) : rawLine).trim();
    if (!line) return;
    const kv = splitKeyValue(line);
    if (!kv) return;
    const directive = DIRECTIVES[kv.key.toLowerCase().replace(/[\s_]+/g, ' ').replace(/ - /g, '-')];
    switch (directive) {
      case 'user-agent': {
        if (!current || !inAgentRun) {
          current = { userAgents: [], agentCrawlDelays: [], rules: [], line: lineNo };
          groups.push(current);
          delayFrom = 0;
          lastDelay = null;
        }
        current.userAgents.push(kv.value);
        current.agentCrawlDelays.push(null);
        inAgentRun = true;
        break;
      }
      case 'allow':
      case 'disallow': {
        inAgentRun = false;
        if (!current || kv.value === '') break; // empty rule = no restriction
        current.rules.push({
          allow: directive === 'allow',
          pattern: normalizePattern(kv.value),
          raw: kv.value,
          line: lineNo,
        });
        break;
      }
      case 'crawl-delay': {
        // Does not end the user-agent run (rules stay grouped as in Google's parser), but applies
        // only to the agents written above it, so a delay for `AhrefsBot` never reaches `*`.
        if (!current) break;
        const seconds = Number.parseFloat(kv.value.replace(',', '.'));
        if (!Number.isFinite(seconds) || seconds < 0) break;
        const delays = current.agentCrawlDelays;
        if (delayFrom < delays.length) {
          for (let i = delayFrom; i < delays.length; i++) delays[i] = seconds;
          lastDelay = [delayFrom, delays.length];
          delayFrom = delays.length;
        } else if (lastDelay) {
          // A second Crawl-delay for the same agents: keep the longer one.
          for (let i = lastDelay[0]; i < lastDelay[1]; i++) delays[i] = Math.max(delays[i] ?? 0, seconds);
        }
        break;
      }
      case 'sitemap': {
        const resolved = resolveSitemapUrl(kv.value, robotsUrl);
        if (resolved && !sitemaps.includes(resolved)) sitemaps.push(resolved);
        break;
      }
      default:
        break; // Host, Clean-param, Content-Signal, Request-rate, ... are ignored
    }
  });

  return { groups, sitemaps };
}

function resolveSitemapUrl(value: string, base?: string): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Leading product-token characters of a user-agent value: `PretoscopBot/1.0` -> `PretoscopBot`. */
export function extractProductToken(userAgentValue: string): string {
  return /^[A-Za-z_-]+/.exec(userAgentValue.trim())?.[0] ?? '';
}

export function isWildcardAgent(userAgentValue: string): boolean {
  const v = userAgentValue.trim();
  return v === '*' || /^\*\s/.test(v);
}

/** Groups that apply to the first token of `tokens` that has a group, else `*`, else none. */
export function selectRobotsGroups(parsed: ParsedRobots, tokens: readonly string[]): RobotsGroupSelection {
  for (const token of tokens) {
    const wanted = token.toLowerCase();
    const isOurs = (ua: string) => !isWildcardAgent(ua) && extractProductToken(ua).toLowerCase() === wanted;
    const groups = parsed.groups.filter((g) => g.userAgents.some(isOurs));
    if (groups.length > 0) return { label: token, via: 'product_token', groups, crawlDelaySec: delayOf(groups, isOurs) };
  }
  const star = parsed.groups.filter((g) => g.userAgents.some(isWildcardAgent));
  if (star.length > 0) return { label: '*', via: 'wildcard', groups: star, crawlDelaySec: delayOf(star, isWildcardAgent) };
  return { label: 'none', via: 'none', groups: [], crawlDelaySec: null };
}

/** Longest Crawl-delay written for the matching user-agent lines of the groups. */
function delayOf(groups: RobotsGroup[], matches: (userAgent: string) => boolean): number | null {
  let delay: number | null = null;
  for (const g of groups) {
    g.userAgents.forEach((ua, i) => {
      const d = g.agentCrawlDelays[i];
      if (matches(ua) && d !== null && d !== undefined) delay = Math.max(delay ?? 0, d);
    });
  }
  return delay;
}

/** User-agent values that only make sense for a substring matcher. Lower-case. */
const GENERIC_FRAGMENTS = new Set([
  'bot',
  'bot-',
  'bot/',
  'bots',
  'robot',
  'robots',
  'crawl',
  'crawler',
  'crawlers',
  'spider',
  'spiders',
  'scraper',
  'scrapers',
  'scrape',
  'scraping',
  'fetch',
  'fetcher',
  'agent',
  'http',
  'client',
  'mozilla',
  'compatible',
]);

/**
 * Non-matching groups that a substring-matching parser (or a naive WAF rule) would apply to our
 * User-Agent, or that name another Pretoscop token. Under RFC 9309 they do not apply; they are
 * reported so a founder can see, per shop, that the decision was deliberate.
 */
export function findIgnoredGroups(
  parsed: ParsedRobots,
  selection: RobotsGroupSelection,
  userAgent: string,
): IgnoredRobotsGroup[] {
  const ua = userAgent.toLowerCase();
  const out: IgnoredRobotsGroup[] = [];
  for (const group of parsed.groups) {
    if (selection.groups.includes(group)) continue;
    for (const value of group.userAgents) {
      const v = value.trim();
      const lower = v.toLowerCase();
      if (!lower || isWildcardAgent(v)) continue;
      if (extractProductToken(v).toLowerCase().startsWith('pretoscop')) {
        out.push({ userAgent: v, reason: 'other_pretoscop_token' });
      } else if (GENERIC_FRAGMENTS.has(lower)) {
        out.push({ userAgent: v, reason: 'generic_fragment' });
      } else if (lower.length >= 3 && ua.includes(lower)) {
        out.push({ userAgent: v, reason: 'substring_of_our_user_agent' });
      }
    }
  }
  return out;
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const ALLOWED_RAW = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]$/;
const HEX = '0123456789ABCDEF';

function encodeUtf8(char: string): string {
  let out = '';
  for (const byte of new TextEncoder().encode(char)) out += `%${HEX[byte >> 4]}${HEX[byte & 15]}`;
  return out;
}

/**
 * Percent-normalization of RFC 9309 §2.2.2: characters that may not appear raw in a URI
 * (non-ASCII, space, quotes, ...) are UTF-8 percent-encoded; percent-encoded unreserved
 * characters (`%62` -> `b`) are decoded; other escapes keep their encoding with upper-case hex.
 * Applied to both paths and patterns (where `*` and `$` keep their special meaning).
 */
export function normalizeRobotsPath(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; ) {
    const ch = input[i] as string;
    if (ch === '%') {
      const hex = input.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        const decoded = String.fromCharCode(Number.parseInt(hex, 16));
        out += UNRESERVED.test(decoded) ? decoded : `%${hex.toUpperCase()}`;
        i += 3;
        continue;
      }
      out += '%25';
      i += 1;
      continue;
    }
    const cp = input.codePointAt(i) as number;
    const char = String.fromCodePoint(cp);
    out += ALLOWED_RAW.test(char) ? char : encodeUtf8(char);
    i += char.length;
  }
  return out;
}

function normalizePattern(value: string): string {
  const normalized = normalizeRobotsPath(value);
  // Patterns must start with "/" (RFC 9309 path-pattern) or "*" (common extension). A pattern such
  // as `index.php?main_page=login` is read as `/index.php?main_page=login` (the stricter reading).
  return normalized.startsWith('/') || normalized.startsWith('*') ? normalized : `/${normalized}`;
}

/** True when `pattern` matches a prefix of `path` (or the whole path when it ends with `$`). */
export function robotsPatternMatches(path: string, pattern: string): boolean {
  // Port of Google's robots_matcher: track the set of possible positions in `path`.
  const pathLen = path.length;
  let positions: number[] = [0];
  for (let p = 0; p < pattern.length; p++) {
    const pc = pattern[p];
    if (pc === '$' && p === pattern.length - 1) {
      return positions[positions.length - 1] === pathLen;
    }
    if (pc === '*') {
      const first = positions[0] as number;
      positions = [];
      for (let i = first; i <= pathLen; i++) positions.push(i);
      continue;
    }
    const next: number[] = [];
    for (const pos of positions) {
      if (pos < pathLen && path[pos] === pc) next.push(pos + 1);
    }
    if (next.length === 0) return false;
    positions = next;
  }
  return true;
}

/** Path plus query of a URL, as RFC 9309 matches it. */
export function robotsPathOf(url: URL): string {
  const path = url.pathname || '/';
  return url.search ? `${path}${url.search}` : path;
}

/** Longest match wins; `allow` wins ties; no matching rule = allowed. */
export function evaluateRobots(groups: readonly RobotsGroup[], pathAndQuery: string): RobotsEvaluation {
  const path = normalizeRobotsPath(pathAndQuery || '/');
  if (path === '/robots.txt') return { allowed: true };
  let best: RobotsRule | undefined;
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!robotsPatternMatches(path, rule.pattern)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
  }
  return best ? { allowed: best.allow, rule: best } : { allowed: true };
}

/** Convenience: decision for a URL under the given product tokens. */
export function isAllowedByParsedRobots(parsed: ParsedRobots, url: URL, tokens: readonly string[]): boolean {
  if (url.pathname === '/robots.txt') return true;
  const selection = selectRobotsGroups(parsed, tokens);
  return evaluateRobots(selection.groups, robotsPathOf(url)).allowed;
}
