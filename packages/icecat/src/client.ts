/**
 * Open Icecat Live JSON API client. Every request goes through `@pretoscop/fetch`'s `fetchPolite`
 * (identified as PretoscopBot-Feed, robots.txt of the API host obeyed, as the Open Icecat licence
 * requires, per-host interval, size caps, request log). No Icecat credentials are sent in headers:
 * Open Icecat needs only the account name as `shopname`.
 *
 * Answers Icecat gives for a single product are results, not reasons to stop:
 * - 200 with `data.GeneralInfo` → found;
 * - 404 → not in Icecat, or "brand restrictions" (Apple: authorised resellers only) → restricted;
 * - a bare 403 → the brand is only in Full Icecat ("este necesar un app_key": Sony, Xiaomi, …).
 *   The fetch layer pauses any host that answers 403 for 24 h; for this API a bare 403 is a
 *   per-product answer, so the client lifts that pause (a 403 with a CDN or WAF signature, a
 *   challenge, a 429 or a robots.txt refusal still stops the run).
 * Every datasheet request is counted against the monthly cap first (`IcecatUsageStore`).
 */
import type { FetchResult, Fetcher } from '@pretoscop/fetch';
import { isProductResponse } from './map';
import type { IcecatProductResponse } from './types';
import { OPEN_ICECAT_MONTHLY_CAP, type IcecatUsageStore } from './usage';

export const ICECAT_API_URL = 'https://live.icecat.biz/api';

export type IcecatFetcher = Pick<Fetcher, 'fetchPolite' | 'unpauseDomain'>;

export interface IcecatClientOptions {
  fetcher: IcecatFetcher;
  /** Open Icecat account name (env ICECAT_USERNAME), sent as `shopname`. */
  shopname: string;
  /** Default `https://live.icecat.biz/api`; a local mock in tests and demos. */
  baseUrl?: string;
  usage: IcecatUsageStore;
  /** Per language and month. Default 1,000,000 (Open Icecat Fair Use Policy). */
  monthlyCap?: number;
  now?: () => Date;
  /** Response size caps. */
  maxJsonBytes?: number;
  maxImageBytes?: number;
}

export type IcecatLookupKey = { gtin: string } | { brand: string; mpn: string };

export type IcecatLookupResult =
  | { status: 'found'; response: IcecatProductResponse; url: string }
  | { status: 'not_found'; detail: string }
  | { status: 'restricted'; detail: string }
  | { status: 'full_only'; detail: string }
  | { status: 'cap_reached'; used: number }
  | { status: 'stop'; reason: string };

export type IcecatImageResult =
  | { status: 'ok'; bytes: Uint8Array; contentType: string | null }
  | { status: 'skip'; reason: string }
  | { status: 'stop'; reason: string };

export interface IcecatClient {
  lookup(key: IcecatLookupKey, lang: string): Promise<IcecatLookupResult>;
  image(url: string): Promise<IcecatImageResult>;
  /** The URL a lookup would request (logs, the CLI). */
  lookupUrl(key: IcecatLookupKey, lang: string): string;
}

const BARE_403 = 'HTTP 403 Forbidden';

function parseJson(body: string | null): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** Any message string in an Icecat error document. */
function messageOf(json: unknown, body: string | null): string {
  if (json && typeof json === 'object') {
    const values = Object.values(json as Record<string, unknown>).filter(
      (v): v is string => typeof v === 'string',
    );
    if (values.length > 0) return values.join(' ').slice(0, 300);
  }
  return (body ?? '').slice(0, 300);
}

function stopReason(res: FetchResult): string {
  if (res.skipped === 'robots_disallowed') {
    return `robots.txt of ${new URL(res.url).host} disallows ${new URL(res.url).pathname} (the Open Icecat licence requires obeying it)`;
  }
  if (res.skipped)
    return `skipped: ${res.skipped}${res.blockDetail ? ` (${res.blockDetail})` : ''}`;
  if (res.blocked)
    return `blocked: ${res.blockReason}${res.blockDetail ? ` (${res.blockDetail})` : ''}`;
  return `HTTP ${res.status}${res.errorCode ? ` ${res.errorCode}` : ''}${res.error ? `: ${res.error}` : ''}`;
}

export function createIcecatClient(opts: IcecatClientOptions): IcecatClient {
  const base = opts.baseUrl ?? ICECAT_API_URL;
  const cap = opts.monthlyCap ?? OPEN_ICECAT_MONTHLY_CAP;
  const now = opts.now ?? (() => new Date());

  function lookupUrl(key: IcecatLookupKey, lang: string): string {
    const u = new URL(base);
    u.searchParams.set('lang', lang.toUpperCase());
    u.searchParams.set('shopname', opts.shopname);
    if ('gtin' in key) u.searchParams.set('GTIN', key.gtin);
    else {
      u.searchParams.set('Brand', key.brand);
      u.searchParams.set('ProductCode', key.mpn);
    }
    return u.toString();
  }

  async function liftBare403(res: FetchResult): Promise<boolean> {
    // The fetch layer's detail for a 403 without any CDN/WAF signature: "HTTP 403 Forbidden (paused until …)".
    if (!(
      res.blocked &&
      res.blockReason === 'http_403' &&
      (res.blockDetail ?? '').startsWith(BARE_403)
    ))
      return false;
    await opts.fetcher.unpauseDomain(new URL(res.finalUrl || res.url).host);
    return true;
  }

  return {
    lookupUrl,

    async lookup(key, lang) {
      const reserved = await opts.usage.reserve(lang, cap, now());
      if (!reserved.allowed) return { status: 'cap_reached', used: reserved.used };
      const url = lookupUrl(key, lang);
      const res = await opts.fetcher.fetchPolite(url, {
        purpose: 'feed',
        shopSlug: 'icecat',
        accept: 'application/json',
        maxBytes: opts.maxJsonBytes ?? 8 * 1024 * 1024,
      });
      if (await liftBare403(res))
        return {
          status: 'full_only',
          detail: 'HTTP 403: brand content only in Full Icecat (app_key)',
        };
      if (res.skipped || res.blocked) return { status: 'stop', reason: stopReason(res) };
      const json = parseJson(res.body);
      if (res.status === 200) {
        if (isProductResponse(json)) return { status: 'found', response: json, url };
        return {
          status: 'not_found',
          detail: `200 without a datasheet: ${messageOf(json, res.body)}`,
        };
      }
      if (res.status === 404 || res.status === 400) {
        const msg = messageOf(json, res.body);
        if (/brand restriction|access is limited|restric/i.test(msg))
          return { status: 'restricted', detail: msg };
        return { status: 'not_found', detail: msg || `HTTP ${res.status}` };
      }
      return { status: 'stop', reason: stopReason(res) };
    },

    async image(url) {
      const res = await opts.fetcher.fetchPolite(url, {
        purpose: 'feed',
        shopSlug: 'icecat',
        accept: 'image/avif,image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.5',
        maxBytes: opts.maxImageBytes ?? 12 * 1024 * 1024,
      });
      if (await liftBare403(res)) return { status: 'skip', reason: 'HTTP 403' };
      if (res.skipped || res.blocked) return { status: 'stop', reason: stopReason(res) };
      if (res.status === 200 && res.bodyBytes && res.bodyBytes.length > 0) {
        return { status: 'ok', bytes: res.bodyBytes, contentType: res.contentType };
      }
      if (res.status >= 400 && res.status < 500)
        return { status: 'skip', reason: `HTTP ${res.status}` };
      return { status: 'stop', reason: stopReason(res) };
    },
  };
}
