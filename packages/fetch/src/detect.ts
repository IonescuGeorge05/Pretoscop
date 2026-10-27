import { fetchCodeOf } from './errors';
import { sameSite } from './site';
import type { BlockReason, FetchErrorCode, FetchPurpose } from './types';

/**
 * Block detection. Pure: decides from a status, headers, a body excerpt, a transport error or a
 * redirect target whether the shop's edge refused us. The fetcher pauses the host on a block.
 *
 * False-positive guards:
 * - bodies are scanned only when they are HTML documents (never text/plain, XML, CSV or JSON), so
 *   vendor names inside robots.txt files (Decathlon lists `/_Incapsula_Resource`) are not blocks;
 * - Cloudflare injects `/cdn-cgi/challenge-platform/scripts/jsd/main.js` into normal pages, so
 *   that path alone is not a challenge (`_cf_chl_opt` or the `/h/.../orchestrate/` path is);
 * - weak markers (`/_fs-ch-`, `EO_Bot_Ssid`, `_Incapsula_Resource`, "captcha" in the title) count
 *   only on interstitial-sized pages (< 64 KiB); real product pages are larger.
 */

export type BlockVendor =
  | 'cloudflare'
  | 'akamai'
  | 'cloudfront'
  | 'fastly'
  | 'edgeone'
  | 'distinct'
  | 'datadome'
  | 'perimeterx'
  | 'imperva'
  | 'unknown';

export interface BlockDetectionInput {
  status?: number;
  headers?: Record<string, string | string[] | undefined>;
  contentType?: string | null;
  /** Decoded body text (only the first 256 KiB are scanned). */
  body?: string | null;
  /** Transport error thrown by the HTTP client. */
  error?: unknown;
  /** Requested URL (absolute). */
  url?: string;
  /** Redirect target (absolute or relative to `url`); defaults to the `location` header. */
  location?: string | null;
  purpose?: FetchPurpose;
  /** Clock for HTTP-date `Retry-After` values. Default `Date.now()`. */
  nowMs?: number;
}

export interface BlockDetection {
  blocked: boolean;
  reason?: BlockReason;
  vendor?: BlockVendor;
  detail?: string;
  /** Parsed `Retry-After` (429/503/511), in ms from now. */
  retryAfterMs?: number;
  /** For transport errors: the classified error. */
  transportError?: TransportErrorClass;
}

export interface TransportErrorClass {
  code: FetchErrorCode;
  /** The edge refused us (resets, GOAWAY, TLS failures, connect timeouts). */
  block: boolean;
  /** Worth retrying after back-off. */
  transient: boolean;
  /** Counts towards the consecutive-failure breaker. */
  countsAsFailure: boolean;
  message: string;
}

export const INTERSTITIAL_MAX_CHARS = 64 * 1024;
const SCAN_LIMIT_CHARS = 256 * 1024;

const CERT_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'CERT_UNTRUSTED',
  'CERT_SIGNATURE_FAILURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
]);

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === 'object'; i++) {
    chain.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return chain;
}

/** Classifies an error thrown while connecting, sending or reading a response. */
export function classifyTransportError(error: unknown): TransportErrorClass {
  const chain = errorChain(error);
  const codes = chain.map((e) => (typeof e.code === 'string' ? e.code : ''));
  const names = chain.map((e) => (typeof e.name === 'string' ? e.name : ''));
  const text = chain
    .map((e) => (typeof e.message === 'string' ? e.message : ''))
    .filter(Boolean)
    .join(' | ');
  const message = text || String(error);
  const has = (...wanted: string[]) => codes.some((c) => wanted.includes(c));
  const block = (code: FetchErrorCode): TransportErrorClass => ({
    code,
    block: true,
    transient: false,
    countsAsFailure: false,
    message,
  });
  const failure = (code: FetchErrorCode, transient: boolean): TransportErrorClass => ({
    code,
    block: false,
    transient,
    countsAsFailure: true,
    message,
  });
  const neutral = (code: FetchErrorCode): TransportErrorClass => ({
    code,
    block: false,
    transient: false,
    countsAsFailure: false,
    message,
  });

  // Errors raised by the fetch layer itself (timeouts, size cap, decoding, aborts) come first.
  const own = chain.map(fetchCodeOf).find((c) => c !== undefined);
  if (own) {
    if (own === 'timeout') return failure('timeout', true);
    if (own === 'aborted' || own === 'body_too_large' || own === 'decode_error') return neutral(own);
    return failure(own, true);
  }
  // A request we could not even build (bad header value): our fault, not the shop's.
  if (has('UND_ERR_INVALID_ARG', 'ERR_INVALID_CHAR', 'ERR_INVALID_HTTP_TOKEN')) return neutral('invalid_request');
  if (codes.some((c) => CERT_ERROR_CODES.has(c))) return neutral('tls_certificate');
  if (has('UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT')) return block('connect_timeout');
  if (
    has('ERR_HTTP2_STREAM_ERROR', 'ERR_HTTP2_SESSION_ERROR', 'ERR_HTTP2_GOAWAY_SESSION', 'ERR_HTTP2_STREAM_CANCEL') ||
    /GOAWAY|NGHTTP2_|RST_STREAM/.test(message)
  ) {
    return block('http2_reset');
  }
  if (
    codes.some((c) => c.startsWith('ERR_SSL_') || (c.startsWith('ERR_TLS_') && !CERT_ERROR_CODES.has(c))) ||
    has('EPROTO') ||
    /before secure TLS connection was established|SSL routines|ssl3_|tls_|handshake failure/i.test(message)
  ) {
    return block('tls_error');
  }
  if (has('ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'ECONNABORTED')) return block('connection_reset');
  if (has('UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT') || names.includes('TimeoutError')) {
    return failure('timeout', true);
  }
  if (has('UND_ERR_ABORTED', 'ABORT_ERR') || names.includes('AbortError')) return neutral('aborted');
  if (has('UND_ERR_RES_EXCEEDED_MAX_SIZE')) return neutral('body_too_large');
  if (has('ENOTFOUND')) return failure('dns', false);
  if (has('EAI_AGAIN')) return failure('dns', true);
  if (has('ECONNREFUSED')) return failure('connection_refused', true);
  if (has('EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EHOSTDOWN')) return failure('network_unreachable', true);
  if (codes.some((c) => c.startsWith('HPE_')) || names.includes('HTTPParserError')) {
    return failure('protocol_error', false);
  }
  return failure('network', true);
}

/** `Retry-After` as delta-seconds or HTTP-date, in ms from `nowMs`. */
export function parseRetryAfter(value: string | string[] | undefined | null, nowMs: number = Date.now()): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - nowMs);
}

function header(headers: BlockDetectionInput['headers'], name: string): string {
  const v = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (v === undefined) return '';
  return Array.isArray(v) ? v.join(', ') : v;
}

const NON_HTML_TYPES =
  /^(text\/(plain|xml|csv|css|javascript|calendar|tab-separated-values)|application\/(xml|json|ld\+json|csv|javascript|x-ndjson|rss\+xml|atom\+xml|octet-stream|gzip|x-gzip|zip|pdf)|image\/|audio\/|video\/|font\/)/i;

/** True when the body is an HTML document (content type alone is not trusted). */
export function looksLikeHtml(contentType: string | null | undefined, body: string | null | undefined): boolean {
  if (!body) return false;
  const ct = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (ct && (NON_HTML_TYPES.test(ct) || ct.endsWith('+xml') || ct.endsWith('+json'))) {
    if (ct !== 'application/xhtml+xml') return false;
  }
  const head = body.slice(0, 2048).replace(/^\uFEFF/, '').toLowerCase();
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<title[\s>]|<script[\s>]|<meta[\s>]/.test(head);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number.parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function titleOf(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1] ?? '').replace(/\s+/g, ' ').trim() : '';
}

interface Marker {
  vendor: BlockVendor;
  detail: string;
  strong: boolean;
  test: (html: string, lower: string, title: string) => boolean;
}

const MARKERS: Marker[] = [
  {
    vendor: 'cloudflare',
    detail: 'Cloudflare challenge page ("Just a moment...", _cf_chl_opt)',
    strong: true,
    test: (html, lower, title) =>
      html.includes('_cf_chl_opt') ||
      /\/cdn-cgi\/challenge-platform\/h\/[a-z]\/orchestrate\//i.test(html) ||
      (title.toLowerCase() === 'just a moment...' && lower.includes('challenge-platform')),
  },
  {
    vendor: 'fastly',
    detail: 'Fastly client challenge ("Client Challenge" interstitial)',
    strong: true,
    test: (_html, _lower, title) => title.toLowerCase() === 'client challenge',
  },
  {
    vendor: 'distinct',
    detail: 'Distinct traffic filter CAPTCHA ("Distinct Captcha")',
    strong: true,
    test: (_html, lower) =>
      lower.includes('distinct captcha') || lower.includes('distinct traffic filter') || lower.includes('captcha.distinct.ro'),
  },
  {
    vendor: 'datadome',
    detail: 'DataDome CAPTCHA (captcha-delivery.com)',
    strong: true,
    test: (_html, lower) => lower.includes('captcha-delivery.com'),
  },
  {
    vendor: 'perimeterx',
    detail: 'PerimeterX/HUMAN CAPTCHA (px-captcha)',
    strong: true,
    test: (_html, lower) => lower.includes('px-captcha') || lower.includes('captcha.px-cdn.net'),
  },
  {
    vendor: 'imperva',
    detail: 'Imperva/Incapsula block page (incident ID)',
    strong: true,
    test: (_html, lower) => lower.includes('incapsula incident id'),
  },
  {
    vendor: 'akamai',
    detail: 'Akamai Bot Manager challenge (sec-if-cpt-container)',
    strong: true,
    test: (_html, lower) => lower.includes('sec-if-cpt-container'),
  },
  {
    vendor: 'edgeone',
    detail: 'Tencent EdgeOne JavaScript challenge (EO_Bot_Ssid cookie)',
    strong: false,
    test: (html) => html.includes('EO_Bot_Ssid') || html.includes('__tst_status'),
  },
  {
    vendor: 'fastly',
    detail: 'Fastly client challenge assets (/_fs-ch-)',
    strong: false,
    test: (html) => html.includes('/_fs-ch-'),
  },
  {
    vendor: 'imperva',
    detail: 'Imperva/Incapsula JavaScript challenge (_Incapsula_Resource on an interstitial page)',
    strong: false,
    test: (html) => html.includes('_Incapsula_Resource'),
  },
  {
    vendor: 'akamai',
    detail: 'Akamai Bot Manager challenge (/_sec/cp_challenge/)',
    strong: false,
    test: (html) => html.includes('/_sec/cp_challenge/'),
  },
  {
    vendor: 'unknown',
    detail: 'CAPTCHA page (title mentions captcha)',
    strong: false,
    test: (_html, _lower, title) => /captcha/i.test(title),
  },
];

/** Scans an HTML document for challenge/interstitial markers. */
export function findChallengeMarker(body: string): { vendor: BlockVendor; detail: string } | null {
  const html = body.length > SCAN_LIMIT_CHARS ? body.slice(0, SCAN_LIMIT_CHARS) : body;
  const lower = html.toLowerCase();
  const title = titleOf(html);
  const small = body.length < INTERSTITIAL_MAX_CHARS;
  for (const marker of MARKERS) {
    if (!marker.strong && !small) continue;
    if (marker.test(html, lower, title)) return { vendor: marker.vendor, detail: marker.detail };
  }
  return null;
}

const CHALLENGE_HOSTS: Array<{ re: RegExp; vendor: BlockVendor }> = [
  { re: /(^|\.)captcha-delivery\.com$/i, vendor: 'datadome' },
  { re: /(^|\.)distinct\.ro$/i, vendor: 'distinct' },
  { re: /^challenges\.cloudflare\.com$/i, vendor: 'cloudflare' },
  { re: /(^|\.)(perimeterx\.net|px-cdn\.net|px-cloud\.net)$/i, vendor: 'perimeterx' },
  { re: /(^|\.)(hcaptcha\.com|recaptcha\.net|perfdrive\.com|geetest\.com|arkoselabs\.com|funcaptcha\.com)$/i, vendor: 'unknown' },
];

/** Matched against the path only (never the query: `/login?recaptcha=1` is not a challenge). */
const CHALLENGE_PATHS: Array<{ re: RegExp; vendor: BlockVendor }> = [
  { re: /captcha/i, vendor: 'unknown' },
  { re: /\/_fs-ch-/, vendor: 'fastly' },
  { re: /\/cdn-cgi\/challenge-platform\//, vendor: 'cloudflare' },
  { re: /\/_Incapsula_Resource/i, vendor: 'imperva' },
  { re: /\/_sec\/cp_challenge/, vendor: 'akamai' },
];

/** A whole host label that names a challenge service: `captcha.distinct.ro`, `challenge.hoster.ro`. */
const CHALLENGE_LABEL = /^(captcha\d*|challenges?|botcheck)$/i;

/**
 * A redirect that leads to a CAPTCHA or challenge (evoMAG's 302 to `captcha.distinct.ro`). Such a
 * redirect is never followed. Known vendor hosts and whole `captcha`/`challenge` labels count only
 * when the target is another site; challenge paths count anywhere.
 */
export function detectChallengeRedirect(from: URL, to: URL): { vendor: BlockVendor; detail: string } | null {
  const host = to.hostname.toLowerCase();
  if (!sameSite(from, to)) {
    for (const { re, vendor } of CHALLENGE_HOSTS) {
      if (re.test(host)) return { vendor, detail: `redirect to challenge host ${host}` };
    }
    if (host.split('.').some((label) => CHALLENGE_LABEL.test(label))) {
      return { vendor: 'unknown', detail: `redirect to challenge host ${host}` };
    }
  }
  for (const { re, vendor } of CHALLENGE_PATHS) {
    if (re.test(to.pathname)) return { vendor, detail: `redirect to challenge path ${to.pathname}` };
  }
  return null;
}

function vendorHint403(headers: BlockDetectionInput['headers'], html: string): { vendor: BlockVendor; detail: string } {
  const server = header(headers, 'server').toLowerCase();
  const lower = decodeEntities(html.slice(0, SCAN_LIMIT_CHARS)).toLowerCase();
  if (server.includes('akamaighost') || lower.includes('errors.edgesuite.net') || /access denied[\s\S]*reference #/.test(lower)) {
    return { vendor: 'akamai', detail: 'Akamai "Access Denied" (Reference #)' };
  }
  if (
    server.includes('cloudfront') ||
    header(headers, 'x-cache').toLowerCase().includes('cloudfront') ||
    header(headers, 'via').toLowerCase().includes('cloudfront') ||
    lower.includes('generated by cloudfront')
  ) {
    return { vendor: 'cloudfront', detail: 'CloudFront "Request blocked" (403)' };
  }
  if (server.includes('cloudflare') || header(headers, 'cf-ray') || lower.includes('attention required! | cloudflare')) {
    return { vendor: 'cloudflare', detail: 'Cloudflare block (403)' };
  }
  if (header(headers, 'x-datadome') || header(headers, 'x-dd-b')) return { vendor: 'datadome', detail: 'DataDome block (403)' };
  if (server.includes('tencentedgeone')) return { vendor: 'edgeone', detail: 'Tencent EdgeOne block (403)' };
  if (header(headers, 'x-iinfo') || header(headers, 'x-cdn').toLowerCase().includes('incapsula')) {
    return { vendor: 'imperva', detail: 'Imperva/Incapsula block (403)' };
  }
  return { vendor: 'unknown', detail: 'HTTP 403 Forbidden' };
}

/** Decides whether a response or transport error is a block. See the module comment. */
export function detectBlock(input: BlockDetectionInput): BlockDetection {
  if (input.error !== undefined && input.error !== null) {
    const cls = classifyTransportError(input.error);
    return cls.block
      ? { blocked: true, reason: 'transport', vendor: 'unknown', detail: `${cls.code}: ${cls.message}`, transportError: cls }
      : { blocked: false, transportError: cls };
  }

  const status = input.status ?? 0;
  const headers = input.headers;
  const nowMs = input.nowMs ?? Date.now();
  const retryAfterMs = parseRetryAfter(header(headers, 'retry-after'), nowMs);
  const withRetry = <T extends BlockDetection>(d: T): T => (retryAfterMs !== undefined ? { ...d, retryAfterMs } : d);

  if (status >= 300 && status < 400) {
    const location = input.location ?? header(headers, 'location');
    if (location && input.url) {
      try {
        const from = new URL(input.url);
        const to = new URL(location, from);
        const hit = detectChallengeRedirect(from, to);
        if (hit) return { blocked: true, reason: 'captcha_redirect', vendor: hit.vendor, detail: hit.detail };
      } catch {
        // an unparsable Location is handled by the fetcher
      }
    }
    return { blocked: false };
  }

  if (header(headers, 'cf-mitigated').toLowerCase().includes('challenge')) {
    return withRetry({ blocked: true, reason: 'challenge', vendor: 'cloudflare', detail: 'Cloudflare challenge (cf-mitigated: challenge)' });
  }

  const body = input.body ?? '';
  if (looksLikeHtml(input.contentType, body)) {
    const hit = findChallengeMarker(body);
    if (hit) return withRetry({ blocked: true, reason: 'challenge', vendor: hit.vendor, detail: hit.detail });
  }

  if (status === 429) {
    return withRetry({ blocked: true, reason: 'http_429', vendor: 'unknown', detail: 'HTTP 429 Too Many Requests' });
  }
  if (status === 511) {
    return withRetry({
      blocked: true,
      reason: 'http_429',
      vendor: 'unknown',
      detail: 'HTTP 511 (bot throttling, treated like 429 with a 24 h pause)',
    });
  }
  if (status === 403) {
    const hint = vendorHint403(headers, looksLikeHtml(input.contentType, body) ? body : '');
    return withRetry({ blocked: true, reason: 'http_403', vendor: hint.vendor, detail: hint.detail });
  }
  return withRetry({ blocked: false });
}
