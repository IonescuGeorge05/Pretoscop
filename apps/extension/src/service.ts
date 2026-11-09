import { shopForHost } from './shops';
import { validateIds, type PageIds } from './identifiers';
import { parseLookupData } from './lookup-data';
import { LOOKUP_MESSAGE, type LookupReply } from './messages';

/**
 * The background worker's lookup logic (kept free of `chrome.*` so it is unit-tested): checks
 * that a message comes from this extension's content script in the top frame of a supported shop
 * tab, re-validates the identifiers against that tab's shop, and asks the Pretoscop API without
 * cookies or referrer. Answers are kept in memory for 10 minutes (nothing is stored on disk), a 429
 * pauses all lookups for its Retry-After, and identical requests in flight are shared.
 */
export interface SenderInfo {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
}

export interface ServiceOptions {
  apiBase: string;
  extensionId: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  timeoutMs?: number;
}

const CACHE_MS = 10 * 60_000;
const DISABLED_CACHE_MS = 30 * 60_000;
const MAX_CACHE = 300;
const INVALID: LookupReply = { ok: false, reason: 'invalid' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The API address for the identifiers (fixed parameter order; brand and part number together). */
export function lookupUrl(apiBase: string, ids: PageIds): string {
  const q = new URLSearchParams();
  q.set('url', ids.url);
  if (ids.gtin) q.set('gtin', ids.gtin);
  if (ids.brand && ids.mpn) {
    q.set('brand', ids.brand);
    q.set('mpn', ids.mpn);
  }
  return `${apiBase.replace(/\/+$/, '')}/api/ext/lookup?${q.toString()}`;
}

export function createLookupService(opts: ServiceOptions) {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const cache = new Map<string, { until: number; reply: LookupReply }>();
  const inflight = new Map<string, Promise<LookupReply>>();
  let pausedUntil = 0;

  function remember(url: string, reply: LookupReply, ms: number): LookupReply {
    cache.delete(url);
    cache.set(url, { until: now() + ms, reply });
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
    return reply;
  }

  async function request(url: string): Promise<LookupReply> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await opts.fetch(url, {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { accept: 'application/json' },
        signal: ctl.signal,
      });
      if (res.status === 200) {
        const data = parseLookupData(await res.json());
        return data ? remember(url, { ok: true, data }, CACHE_MS) : { ok: false, reason: 'unavailable' };
      }
      if (res.status === 404) return remember(url, { ok: false, reason: 'not_found' }, CACHE_MS);
      if (res.status === 429) {
        const sec = Number(res.headers.get('retry-after'));
        pausedUntil = now() + (Number.isFinite(sec) && sec > 0 ? Math.min(sec, 3600) : 60) * 1000;
        return { ok: false, reason: 'rate_limited' };
      }
      if (res.status === 503) {
        const body: unknown = await res.json().catch(() => null);
        if (isObj(body) && body.error === 'disabled') return remember(url, { ok: false, reason: 'disabled' }, DISABLED_CACHE_MS);
      }
      return { ok: false, reason: 'unavailable' };
    } catch {
      return { ok: false, reason: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookup(ids: PageIds): Promise<LookupReply> {
    const url = lookupUrl(opts.apiBase, ids);
    const hit = cache.get(url);
    if (hit && hit.until > now()) return hit.reply;
    if (pausedUntil > now()) return { ok: false, reason: 'rate_limited' };
    const pending = inflight.get(url);
    if (pending) return pending;
    const p = request(url).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  /** Handles one runtime message; anything that is not exactly a lookup from our own content script is refused. */
  async function handle(msg: unknown, sender: SenderInfo): Promise<LookupReply> {
    if (!isObj(msg) || msg.type !== LOOKUP_MESSAGE) return INVALID;
    if (Object.keys(msg).some((k) => k !== 'type' && k !== 'shop' && k !== 'ids')) return INVALID;
    if (sender.id !== opts.extensionId || sender.tab?.id === undefined || sender.frameId !== 0 || !sender.url) return INVALID;
    let host: string;
    try {
      host = new URL(sender.url).hostname;
    } catch {
      return INVALID;
    }
    const shop = shopForHost(host);
    if (!shop || shop.id !== msg.shop) return INVALID;
    const ids = validateIds(msg.ids, shop);
    if (!ids) return INVALID;
    return lookup(ids);
  }

  return { handle, lookup };
}
