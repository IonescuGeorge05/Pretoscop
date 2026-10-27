import type { Transform } from 'node:stream';
import zlib from 'node:zlib';
import { FetchError } from './errors';

/**
 * Body decoding: HTTP content-encodings (gzip, deflate, br) through node:zlib with the size cap
 * applied to the decoded output (zip-bomb guard), then charset decoding for textual types.
 */

export interface DecodedBytes {
  data: Buffer;
  truncated: boolean;
}

function inflateWith(input: Buffer, make: () => Transform, maxBytes: number, truncate: boolean): Promise<DecodedBytes> {
  return new Promise((resolve, reject) => {
    const stream = make();
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (total + chunk.length > maxBytes) {
        if (truncate) {
          chunks.push(chunk.subarray(0, maxBytes - total));
          total = maxBytes;
          finish(() => resolve({ data: Buffer.concat(chunks), truncated: true }));
        } else {
          finish(() => reject(new FetchError('body_too_large', `decoded body exceeded ${maxBytes} bytes`)));
        }
        stream.destroy();
        return;
      }
      chunks.push(chunk);
      total += chunk.length;
    });
    stream.on('end', () => finish(() => resolve({ data: Buffer.concat(chunks), truncated: false })));
    stream.on('error', (error) => {
      // A truncated download (robots.txt over the parse limit) ends mid-stream: keep what decoded.
      if (truncate && chunks.length > 0) finish(() => resolve({ data: Buffer.concat(chunks), truncated: true }));
      else finish(() => reject(new FetchError('decode_error', `could not decode body: ${error.message}`, { cause: error })));
    });
    stream.end(input);
  });
}

async function decodeOne(input: Buffer, encoding: string, maxBytes: number, truncate: boolean): Promise<DecodedBytes> {
  // A deliberately truncated download (robots.txt over the parse limit) ends mid-stream: flush
  // what decodes instead of failing. Complete downloads must end cleanly.
  const flush = truncate ? { finishFlush: zlib.constants.Z_SYNC_FLUSH } : {};
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
      return inflateWith(input, () => zlib.createGunzip(flush), maxBytes, truncate);
    case 'deflate':
      try {
        return await inflateWith(input, () => zlib.createInflate(flush), maxBytes, truncate);
      } catch (error) {
        if (error instanceof FetchError && error.fetchCode === 'body_too_large') throw error;
        // Some servers send raw DEFLATE (RFC 1951) instead of zlib-wrapped data.
        return inflateWith(input, () => zlib.createInflateRaw(flush), maxBytes, truncate);
      }
    case 'br':
      return inflateWith(
        input,
        () =>
          zlib.createBrotliDecompress(truncate ? { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH } : {}),
        maxBytes,
        truncate,
      );
    case 'identity':
    case '':
      return { data: input, truncated: false };
    default:
      throw new FetchError('decode_error', `unsupported content-encoding "${encoding}"`);
  }
}

/** Undoes the `Content-Encoding` chain (applied in order, so decoded in reverse). */
export async function decodeContentEncoding(
  input: Buffer,
  contentEncoding: string | undefined,
  maxBytes: number,
  truncate: boolean,
): Promise<DecodedBytes> {
  const encodings = (contentEncoding ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .reverse();
  let data = input;
  let truncated = false;
  for (const encoding of encodings) {
    if (data.length === 0) break;
    const out = await decodeOne(data, encoding, maxBytes, truncate);
    data = out.data;
    truncated ||= out.truncated;
  }
  return { data, truncated };
}

export function isGzipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** A gzip *file* (`sitemap.xml.gz`, `feed.csv.gz`), as opposed to a gzip content-encoding. */
export function gunzipFile(input: Buffer, maxBytes: number): Promise<DecodedBytes> {
  return inflateWith(input, () => zlib.createGunzip(), maxBytes, false);
}

function mediaType(contentType: string | null | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** true = text, false = binary, null = unknown (sniff). */
export function isTextualContentType(contentType: string | null | undefined): boolean | null {
  const type = mediaType(contentType);
  if (!type) return null;
  if (type.startsWith('text/')) return true;
  if (type.endsWith('+xml') || type.endsWith('+json')) return true;
  if (
    [
      'application/xml',
      'application/json',
      'application/javascript',
      'application/x-javascript',
      'application/ecmascript',
      'application/csv',
      'application/x-ndjson',
      'application/x-www-form-urlencoded',
    ].includes(type)
  ) {
    return true;
  }
  if (type === 'application/octet-stream') return null;
  return false;
}

/** No NUL byte in the first KiB and not gzip. */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (isGzipMagic(bytes)) return false;
  const n = Math.min(bytes.length, 1024);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

function supported(label: string): string | null {
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return null;
  }
}

/**
 * Charset in priority order: byte-order mark, Content-Type `charset=`, `<meta charset>` /
 * `<meta http-equiv>` (HTML), `<?xml encoding?>` (XML), else UTF-8. Labels such as
 * `windows-1250` and `iso-8859-2` (older Romanian shops) are decoded by TextDecoder.
 */
export function detectCharset(bytes: Uint8Array, contentType: string | null | undefined): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const fromHeader = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType ?? '')?.[1];
  if (fromHeader) {
    const enc = supported(fromHeader);
    if (enc) return enc;
  }
  const head = Buffer.from(bytes.subarray(0, 4096)).toString('latin1');
  const fromMeta =
    /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1] ??
    /<\?xml[^>]+encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1];
  if (fromMeta) {
    const enc = supported(fromMeta);
    if (enc) return enc;
  }
  return 'utf-8';
}

export function decodeText(bytes: Uint8Array, contentType: string | null | undefined): string {
  return new TextDecoder(detectCharset(bytes, contentType)).decode(bytes);
}
