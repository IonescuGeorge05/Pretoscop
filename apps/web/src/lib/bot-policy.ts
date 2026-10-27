import { isIP } from 'node:net';

/**
 * What /bot and /bot/ips.json publish about PretoscopBot. The numbers mirror the polite fetcher
 * (packages/fetch, M02) and docs/03 §6.2; change them together. This describes PretoscopBot only:
 * other channels (feeds, the assisted channel) are described on /metodologie.
 */

export const BOT_TOKEN = 'PretoscopBot';
export const FEED_TOKEN = 'PretoscopBot-Feed';
export const BOT_VERSION = '1.0';
export const DEFAULT_BOT_INFO_URL = 'https://pretoscop.ro/bot';

/** Same rule as the fetcher: an absolute http(s) URL that cannot break the User-Agent syntax. */
export function resolveBotInfoUrl(value: string | null | undefined): string {
  const v = value?.trim();
  if (!v || !/^https?:\/\/[^\s;()]+$/i.test(v)) return DEFAULT_BOT_INFO_URL;
  try {
    new URL(v);
    return v;
  } catch {
    return DEFAULT_BOT_INFO_URL;
  }
}

/** `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)` and the feed variant. */
export function botUserAgents(infoUrl?: string | null): { page: string; feed: string } {
  const url = resolveBotInfoUrl(infoUrl);
  return {
    page: `Mozilla/5.0 (compatible; ${BOT_TOKEN}/${BOT_VERSION}; +${url})`,
    feed: `Mozilla/5.0 (compatible; ${FEED_TOKEN}/${BOT_VERSION}; +${url})`,
  };
}

export const BOT_POLICY = {
  /** Minimum time between the starts of two requests to one site. */
  minIntervalSeconds: 5,
  /** Requests in flight per site. */
  concurrency: 1,
  /** Preferred window for bulk collection (Europe/Bucharest). */
  offPeakWindow: '02:00–07:00',
  /** robots.txt is re-read at least this often. */
  robotsCacheHours: 24,
  /** robots.txt `Crawl-delay` is honoured up to this cap. */
  crawlDelayCapHours: 1,
  /** Pause of a site after a 403, a challenge, a CAPTCHA or a dropped connection. */
  blockPauseHours: 24,
  /** Minimum pause after a 429 (longer when Retry-After asks for it). */
  tooManyRequestsPauseHours: 1,
  /** Retries after temporary server errors. */
  maxRetries: 2,
  /** Reply to (and apply) a stop request within this many business days. */
  stopWithinBusinessDays: 1,
} as const;

/**
 * Reverse DNS of the egress IPs (setup A4): each address resolves to `crawl-N.<domain>`, which
 * resolves back to the same address (forward-confirmed). `pnpm --filter @pretoscop/worker bot:check`
 * checks it; infra/bot-program/reverse-dns.md has the steps.
 */
export const BOT_RDNS_DOMAIN = 'bot.pretoscop.ro';

export type BotProgramStatus = 'pregatire' | 'trimis' | 'acceptat' | 'respins';

/**
 * Bot verification programmes (setup C2; dossiers in infra/bot-program/). Update the status when a
 * founder submits or hears back, and add a changelog entry.
 */
export const BOT_PROGRAMS: ReadonlyArray<{ id: string; name: string; status: BotProgramStatus; how: string }> = [
  {
    id: 'cloudflare',
    name: 'Cloudflare Verified Bots',
    status: 'pregatire',
    how: 'Până la verificare: o regulă WAF de tip „Skip” pentru User-Agent-ul nostru împreună cu adresele IP publicate.',
  },
  {
    id: 'akamai',
    name: 'Akamai Bot Manager',
    status: 'pregatire',
    how: 'O categorie de boți proprie (custom bot category) cu adresele IP publicate și User-Agent-ul nostru.',
  },
  {
    id: 'datadome',
    name: 'DataDome',
    status: 'pregatire',
    how: 'După verificare, permite categoria „Comparators” sau adaugă o excepție pentru adresele IP și User-Agent-ul nostru.',
  },
  {
    id: 'fastly',
    name: 'Fastly Bot Management',
    status: 'pregatire',
    how: 'O excepție pentru adresele IP publicate și User-Agent-ul nostru.',
  },
];

export const BOT_PROGRAM_STATUS_LABELS: Record<BotProgramStatus, string> = {
  pregatire: 'cerere în pregătire',
  trimis: 'cerere trimisă',
  acceptat: 'verificat',
  respins: 'respins',
};

/** Newest first. Add an entry for every change of behaviour, identity or published IPs. */
export const BOT_CHANGELOG: ReadonlyArray<{ date: string; change: string }> = [
  {
    date: '2026-10-27',
    change:
      'Pagina descrie cum ne verifici: lista adreselor IP (și în /bot/ips.json, în formatul folosit de marii operatori de roboți), ' +
      'numele reverse DNS crawl-N.bot.pretoscop.ro și semnătura criptografică Web Bot Auth (RFC 9421), pe care o activăm după ' +
      'publicarea cheii. Feed-urile de produse pot fi trimise direct din contul de magazin.',
  },
  {
    date: '2026-10-27',
    change:
      'Prima versiune a paginii: PretoscopBot/1.0 și PretoscopBot-Feed/1.0, cel puțin 5 secunde între cereri către același site, ' +
      'respectarea robots.txt și oprirea la cerere în cel mult o zi lucrătoare. Lista adreselor IP fixe urmează să fie publicată la lansare.',
  },
];

/** Date of the latest change (the `updated` field of /bot/ips.json). */
export function botPolicyUpdated(): string {
  return BOT_CHANGELOG[0]?.date ?? '2026-10-27';
}

/** Splits validated addresses / CIDR prefixes (env `BOT_EGRESS_IPS`) by IP family. */
export function splitEgressIps(list: readonly string[]): { ipv4: string[]; ipv6: string[] } {
  const ipv4: string[] = [];
  const ipv6: string[] = [];
  for (const entry of list) {
    const family = isIP(entry.split('/')[0] ?? '');
    if (family === 4) ipv4.push(entry);
    else if (family === 6) ipv6.push(entry);
  }
  return { ipv4, ipv6 };
}

/**
 * The egress list in the format of googlebot.json / Common Crawl (`prefixes: [{ ipv4Prefix }]`),
 * which WAF tools and bot-verification programmes parse; single addresses become /32 or /128.
 */
export type IpPrefix = { ipv4Prefix: string } | { ipv6Prefix: string };

export function ipPrefixes(list: readonly string[]): IpPrefix[] {
  return list.flatMap((entry): IpPrefix[] => {
    const [ip = '', bits] = entry.split('/');
    const family = isIP(ip);
    if (family === 4) return [{ ipv4Prefix: `${ip}/${bits ?? 32}` }];
    if (family === 6) return [{ ipv6Prefix: `${ip}/${bits ?? 128}` }];
    return [];
  });
}
