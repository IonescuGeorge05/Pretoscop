import { request, type Dispatcher } from 'undici';
import { FetchError } from '../errors';
import type { AssistedClient, AssistedClientRequest, AssistedClientResponse } from './types';

/**
 * Zyte API client (default vendor of ADR-015): `POST https://api.zyte.com/v1/extract`, HTTP Basic
 * auth with the API key as user name and an empty password (docs.zyte.com/zyte-api/usage/http.html).
 *
 * What we ask for, and what we never ask for:
 * - HTTP tier: `{url, httpResponseBody: true, httpResponseHeaders: true, followRedirect: false}`;
 *   browser tier only when the shop's policy says so: `{url, browserHtml: true}`.
 * - `geolocation` only when configured per shop (RO is an "extended" geolocation: dearer, may need
 *   business verification); otherwise Zyte picks.
 * - Never `customHttpRequestHeaders` (no User-Agent of any kind: vendor traffic must not pretend to
 *   be a browser, and must not claim to be PretoscopBot either: docs/12 layer 2b), never `ipType`
 *   (no residential IPs requested by us), no sessions, cookies, actions or screenshots.
 *
 * Status mapping (docs.zyte.com/zyte-api/usage/errors.html, read 2026-10-27): 200 → the shop's
 * response (`statusCode`, headers, body), billed; 520 `/download/temporary-error` → ban
 * (`blocked`); 429 / 503 `/limits/*` → rate limited; 500 `/server/timed-out` → timeout;
 * 401 / 403 / 451 → refused (key, account, forbidden domain); anything else → error. Unsuccessful
 * responses are not billed. Verify these shapes with one request to a test site when the account
 * exists (setup A10) before any shop is switched on.
 */

export const ZYTE_API_URL = 'https://api.zyte.com/v1/extract';

export interface ZyteClientOptions {
  apiKey: string;
  /** Override for the mock server in tests. */
  endpoint?: string;
  dispatcher?: Dispatcher;
  /** Cap on the decoded shop body (the JSON envelope may be ~1.4× larger: base64). */
  maxBodyBytes?: number;
}

interface ZyteHeader {
  name?: unknown;
  value?: unknown;
}

interface ZyteSuccess {
  url?: unknown;
  statusCode?: unknown;
  httpResponseBody?: unknown;
  httpResponseHeaders?: unknown;
  browserHtml?: unknown;
}

interface ZyteProblem {
  type?: unknown;
  title?: unknown;
  detail?: unknown;
  status?: unknown;
}

/** The request body we send for one page (exported for tests and the mock server). */
export function zyteRequestBody(url: string, req: Pick<AssistedClientRequest, 'render' | 'country'>): Record<string, unknown> {
  const body: Record<string, unknown> = { url };
  if (req.render) {
    body.browserHtml = true;
  } else {
    body.httpResponseBody = true;
    body.httpResponseHeaders = true;
    body.followRedirect = false;
  }
  if (req.country) body.geolocation = req.country;
  return body;
}

function headersOf(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(list)) return out;
  for (const h of list as ZyteHeader[]) {
    if (typeof h?.name !== 'string' || typeof h.value !== 'string') continue;
    const key = h.name.toLowerCase();
    out[key] = out[key] ? `${out[key]}, ${h.value}` : h.value;
  }
  return out;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Maps one Zyte API answer (status + parsed JSON) to the channel's response. Pure; tested on recorded shapes. */
export function mapZyteAnswer(vendorStatus: number, json: unknown, requestUrl: string, render: boolean): AssistedClientResponse {
  if (vendorStatus === 200) {
    const ok = (json ?? {}) as ZyteSuccess;
    const finalUrl = str(ok.url) ?? requestUrl;
    if (render) {
      const html = typeof ok.browserHtml === 'string' ? ok.browserHtml : null;
      const status = typeof ok.statusCode === 'number' ? ok.statusCode : html !== null ? 200 : 0;
      return {
        outcome: html !== null ? 'success' : 'error',
        billable: html !== null,
        vendorStatus,
        status,
        body: html,
        finalUrl,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        contentType: 'text/html; charset=utf-8',
        ...(html === null ? { error: 'Zyte answered 200 without browserHtml' } : {}),
      };
    }
    const status = typeof ok.statusCode === 'number' ? ok.statusCode : 0;
    const headers = headersOf(ok.httpResponseHeaders);
    const b64 = typeof ok.httpResponseBody === 'string' ? ok.httpResponseBody : '';
    const bytes = Buffer.from(b64, 'base64');
    return {
      outcome: status > 0 ? 'success' : 'error',
      billable: status > 0,
      vendorStatus,
      status,
      // The fetch layer decodes the bytes with the shop's own charset (Content-Type / meta).
      body: null,
      bodyBytes: new Uint8Array(bytes),
      bytes: bytes.length,
      finalUrl,
      headers,
      contentType: headers['content-type'] ?? null,
      ...(status === 0 ? { error: 'Zyte answered 200 without a statusCode' } : {}),
    };
  }
  const p = (json ?? {}) as ZyteProblem;
  const type = str(p.type) ?? '';
  const what = [str(p.title), str(p.detail)].filter(Boolean).join(': ');
  const detail = `Zyte ${vendorStatus}${type ? ` ${type}` : ''}${what ? ` (${what})` : ''}`;
  const base = { billable: false, vendorStatus, vendorError: type || undefined, status: 0, body: null, finalUrl: requestUrl };
  if (vendorStatus === 520) {
    return { ...base, outcome: 'blocked', blocked: true, blockReason: 'vendor_blocked', blockDetail: `${detail}: the vendor could not get past the shop's protection` };
  }
  if (vendorStatus === 429 || (vendorStatus === 503 && type.startsWith('/limits/'))) {
    return { ...base, outcome: 'rate_limited', error: `${detail}: vendor rate limit` };
  }
  if (vendorStatus === 500 && type === '/server/timed-out') {
    return { ...base, outcome: 'timeout', error: `${detail}: vendor timeout` };
  }
  if (vendorStatus === 401 || vendorStatus === 403 || vendorStatus === 451) {
    return { ...base, outcome: 'refused', error: `${detail}: refused by the vendor` };
  }
  return { ...base, outcome: 'error', error: detail };
}

async function readJson(body: Dispatcher.ResponseData['body'], maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      body.destroy();
      throw new FetchError('body_too_large', `Zyte answer exceeded ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { title: `unparseable answer: ${text.slice(0, 120)}` };
  }
}

export function createZyteClient(opts: ZyteClientOptions): AssistedClient {
  if (!opts.apiKey) throw new Error('createZyteClient: apiKey is required (ZYTE_API_KEY)');
  const endpoint = opts.endpoint ?? ZYTE_API_URL;
  const authorization = `Basic ${Buffer.from(`${opts.apiKey}:`).toString('base64')}`;
  // base64 adds a third; headers and JSON add a little more.
  const maxJsonBytes = Math.ceil((opts.maxBodyBytes ?? 15 * 1024 * 1024) * 1.4) + 64 * 1024;

  return {
    vendor: 'zyte',
    async fetch(url, req): Promise<AssistedClientResponse> {
      const deadline = AbortSignal.timeout(req.timeoutMs);
      const signal = req.signal ? AbortSignal.any([deadline, req.signal]) : deadline;
      try {
        const res = await request(endpoint, {
          method: 'POST',
          headers: { authorization, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(zyteRequestBody(url, req)),
          dispatcher: opts.dispatcher,
          signal,
          headersTimeout: req.timeoutMs,
          bodyTimeout: req.timeoutMs,
        });
        const json = await readJson(res.body, maxJsonBytes);
        return mapZyteAnswer(res.statusCode, json, url, req.render);
      } catch (error) {
        // The caller's own abort propagates; our deadline becomes a timeout outcome.
        if (req.signal?.aborted) throw error;
        if (deadline.aborted) {
          return { outcome: 'timeout', billable: false, vendorStatus: 0, status: 0, body: null, finalUrl: url, error: `Zyte API gave no answer within ${req.timeoutMs} ms` };
        }
        if (error instanceof FetchError && error.fetchCode === 'body_too_large') {
          return { outcome: 'error', billable: true, vendorStatus: 200, status: 0, body: null, finalUrl: url, error: error.message };
        }
        return { outcome: 'error', billable: false, vendorStatus: 0, status: 0, body: null, finalUrl: url, error: `Zyte API unreachable: ${(error as Error).message}` };
      }
    },
  };
}
