import type { FetchPurpose } from './types';

/**
 * Crawler identity (CLAUDE.md: "Identified crawler by default"). The product token is fixed in
 * code; only the info URL inside the User-Agent comes from configuration (`BOT_INFO_URL`).
 * Callers of `fetchPolite` cannot set any header, so the identity cannot be spoofed.
 */

export const BOT_PRODUCT_TOKEN = 'PretoscopBot';
export const FEED_PRODUCT_TOKEN = 'PretoscopBot-Feed';
export const BOT_VERSION = '1.0';
export const DEFAULT_BOT_INFO_URL = 'https://pretoscop.ro/bot';

/** An info URL is accepted only if it is an absolute http(s) URL that cannot break the UA syntax. */
export function isValidBotInfoUrl(value: string): boolean {
  if (!/^https?:\/\/[^\s;()]+$/i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Returns `value` when it is a usable info URL, otherwise the default. */
export function resolveBotInfoUrl(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && isValidBotInfoUrl(trimmed) ? trimmed : DEFAULT_BOT_INFO_URL;
}

export function buildUserAgent(kind: 'page' | 'feed', infoUrl: string = DEFAULT_BOT_INFO_URL): string {
  const token = kind === 'feed' ? FEED_PRODUCT_TOKEN : BOT_PRODUCT_TOKEN;
  return `Mozilla/5.0 (compatible; ${token}/${BOT_VERSION}; +${resolveBotInfoUrl(infoUrl)})`;
}

/** Info URL resolved from the environment at import time (worker entry points load `.env` first). */
export const BOT_INFO_URL = resolveBotInfoUrl(process.env.BOT_INFO_URL);
/** `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)` */
export const BOT_USER_AGENT = buildUserAgent('page', BOT_INFO_URL);
/** `Mozilla/5.0 (compatible; PretoscopBot-Feed/1.0; +https://pretoscop.ro/bot)` */
export const FEED_USER_AGENT = buildUserAgent('feed', BOT_INFO_URL);

export const ACCEPT_LANGUAGE = 'ro-RO,ro;q=0.9,en;q=0.6';
export const ACCEPT_ENCODING = 'gzip, deflate, br';

const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';

export const DEFAULT_ACCEPT: Record<FetchPurpose, string> = {
  robots: 'text/plain,*/*;q=0.8',
  sitemap: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
  feed: 'application/xml,text/xml,text/csv,application/json;q=0.9,*/*;q=0.8',
  listing: HTML_ACCEPT,
  product: HTML_ACCEPT,
  probe: HTML_ACCEPT,
};

/**
 * Product tokens matched against robots.txt groups, most specific first. The feed fetcher also
 * obeys groups written for `PretoscopBot`, so a shop that blocks PretoscopBot blocks both.
 */
export function robotsTokensFor(purpose: FetchPurpose): string[] {
  return purpose === 'feed' ? [FEED_PRODUCT_TOKEN, BOT_PRODUCT_TOKEN] : [BOT_PRODUCT_TOKEN];
}

/** Exactly our User-Agent shape; only the version and the info URL may vary (test override). */
export const USER_AGENT_FORMAT = /^Mozilla\/5\.0 \(compatible; PretoscopBot(?:-Feed)?\/\d+(?:\.\d+)*; \+https?:\/\/[^\s;()]+\)$/;

/** A header value we are willing to send: visible ASCII and spaces only, at most 1 KiB. */
export function isSafeHeaderValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && /^[\x20-\x7e\t]+$/.test(value);
}

/**
 * The complete request header set. Nothing else is ever sent: no cookies, no Referer, no
 * browser client hints (`Sec-*`), no `Upgrade-Insecure-Requests`. Caller-supplied values that are
 * not plain ASCII (a corrupt stored ETag, say) are dropped rather than sent.
 */
export function buildRequestHeaders(input: {
  userAgent: string;
  purpose: FetchPurpose;
  accept?: string;
  etag?: string;
  lastModified?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': input.userAgent,
    accept: isSafeHeaderValue(input.accept) ? input.accept : DEFAULT_ACCEPT[input.purpose],
    'accept-encoding': ACCEPT_ENCODING,
    'accept-language': ACCEPT_LANGUAGE,
  };
  if (isSafeHeaderValue(input.etag)) headers['if-none-match'] = input.etag;
  if (isSafeHeaderValue(input.lastModified)) headers['if-modified-since'] = input.lastModified;
  return headers;
}
