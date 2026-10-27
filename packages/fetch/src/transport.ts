import { request, type Dispatcher } from 'undici';
import { decodeContentEncoding } from './decode';
import { FetchError } from './errors';

export interface HttpGetOptions {
  headers: Record<string, string>;
  dispatcher: Dispatcher;
  /** Overall budget: connect + headers + whole body. */
  timeoutMs: number;
  /** Cap on wire bytes and on decoded bytes. */
  maxBytes: number;
  /** Keep the first `maxBytes` instead of failing (robots.txt parse limit). */
  truncate: boolean;
  signal?: AbortSignal;
}

export interface HttpGetResult {
  status: number;
  headers: Record<string, string>;
  /** Entity after content-decoding. */
  bytes: Buffer;
  wireBytes: number;
  truncated: boolean;
}

export function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

async function readCapped(
  body: Dispatcher.ResponseData['body'],
  maxBytes: number,
  truncate: boolean,
): Promise<{ raw: Buffer; wireBytes: number; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    if (total + buf.length > maxBytes) {
      if (truncate) {
        chunks.push(buf.subarray(0, maxBytes - total));
        body.destroy();
        return { raw: Buffer.concat(chunks), wireBytes: maxBytes, truncated: true };
      }
      body.destroy();
      throw new FetchError('body_too_large', `response body exceeded ${maxBytes} bytes`);
    }
    chunks.push(buf);
    total += buf.length;
  }
  return { raw: Buffer.concat(chunks), wireBytes: total, truncated: false };
}

/**
 * One GET with undici `request` (never the global fetch): no redirect following, no cookies,
 * one fresh connection per request (`reset: true`: at ≥ 5 s per host reuse brings nothing, and a
 * stale reused socket would look like a reset/block). Throws undici errors or `FetchError`.
 */
export async function httpGet(url: string, opts: HttpGetOptions): Promise<HttpGetResult> {
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort(new FetchError('timeout', `no complete response within ${opts.timeoutMs} ms`));
  }, opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([deadline.signal, opts.signal]) : deadline.signal;
  try {
    const res = await request(url, {
      method: 'GET',
      headers: opts.headers,
      dispatcher: opts.dispatcher,
      signal,
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
      reset: true,
    });
    const headers = flattenHeaders(res.headers);
    const declared = Number(headers['content-length']);
    if (!opts.truncate && Number.isFinite(declared) && declared > opts.maxBytes) {
      res.body.destroy();
      throw new FetchError('body_too_large', `content-length ${declared} exceeds ${opts.maxBytes} bytes`);
    }
    const { raw, wireBytes, truncated: wireTruncated } = await readCapped(res.body, opts.maxBytes, opts.truncate);
    const decoded = await decodeContentEncoding(
      raw,
      headers['content-encoding'],
      opts.maxBytes,
      opts.truncate || wireTruncated,
    );
    return {
      status: res.statusCode,
      headers,
      bytes: decoded.data,
      wireBytes,
      truncated: wireTruncated || decoded.truncated,
    };
  } catch (error) {
    if (opts.signal?.aborted) throw new FetchError('aborted', 'request aborted by caller', { cause: error });
    if (deadline.signal.aborted) {
      throw new FetchError('timeout', `no complete response within ${opts.timeoutMs} ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
