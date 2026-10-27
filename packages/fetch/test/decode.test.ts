import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeContentEncoding, decodeText, detectCharset, isTextualContentType, looksLikeText } from '../src/decode';

const text = 'Consolă PlayStation 5 — 2.199,99 lei; ștergător, țeavă, îngheț, ână'.repeat(50);
const raw = Buffer.from(text, 'utf8');

describe('content-encoding', () => {
  it.each([
    ['gzip', zlib.gzipSync(raw)],
    ['x-gzip', zlib.gzipSync(raw)],
    ['deflate', zlib.deflateSync(raw)],
    ['br', zlib.brotliCompressSync(raw)],
    ['identity', raw],
  ])('decodes %s', async (encoding, body) => {
    const out = await decodeContentEncoding(body, encoding, 1 << 20, false);
    expect(out.data.toString('utf8')).toBe(text);
    expect(out.truncated).toBe(false);
  });

  it('decodes raw DEFLATE sent as "deflate"', async () => {
    const out = await decodeContentEncoding(zlib.deflateRawSync(raw), 'deflate', 1 << 20, false);
    expect(out.data.toString('utf8')).toBe(text);
  });

  it('undoes a chain of encodings in reverse order', async () => {
    const body = zlib.brotliCompressSync(zlib.gzipSync(raw));
    const out = await decodeContentEncoding(body, 'gzip, br', 1 << 20, false);
    expect(out.data.toString('utf8')).toBe(text);
  });

  it('rejects unsupported encodings and corrupt data', async () => {
    await expect(decodeContentEncoding(raw, 'zstd', 1 << 20, false)).rejects.toMatchObject({ fetchCode: 'decode_error' });
    await expect(decodeContentEncoding(Buffer.from('not gzip'), 'gzip', 1 << 20, false)).rejects.toMatchObject({
      fetchCode: 'decode_error',
    });
  });

  it('caps the decoded size (zip-bomb guard), or truncates when asked', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(64 * 1024);
    await expect(decodeContentEncoding(bomb, 'gzip', 1024 * 1024, false)).rejects.toMatchObject({ fetchCode: 'body_too_large' });
    const truncated = await decodeContentEncoding(bomb, 'gzip', 1024, true);
    expect(truncated).toMatchObject({ truncated: true });
    expect(truncated.data.length).toBe(1024);
  });
});

describe('charset', () => {
  // "Preţ: Cărţi şi îngheţată" in windows-1250 / iso-8859-2 (cedilla letters, as old shops use).
  const legacy = Buffer.from([
    0x50, 0x72, 0x65, 0xfe, 0x3a, 0x20, 0x43, 0xe3, 0x72, 0xfe, 0x69, 0x20, 0xba, 0x69, 0x20, 0xee, 0x6e, 0x67, 0x68, 0x65,
    0xfe, 0x61, 0x74, 0xe3,
  ]);
  const expected = 'Preţ: Cărţi şi îngheţată';

  it('uses the Content-Type charset (windows-1250)', () => {
    expect(detectCharset(legacy, 'text/html; charset=windows-1250')).toBe('windows-1250');
    expect(decodeText(legacy, 'text/html; charset=windows-1250')).toBe(expected);
  });

  it('falls back to <meta charset> and <?xml encoding?>', () => {
    const html = Buffer.concat([Buffer.from('<html><head><meta charset="iso-8859-2"></head><body>'), legacy]);
    expect(detectCharset(html, 'text/html')).toBe('iso-8859-2');
    expect(decodeText(html, 'text/html')).toContain(expected);
    const httpEquiv = Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=windows-1250">');
    expect(detectCharset(httpEquiv, null)).toBe('windows-1250');
    const xml = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="ISO-8859-2"?><r>'), legacy, Buffer.from('</r>')]);
    expect(decodeText(xml, 'application/xml')).toContain(expected);
  });

  it('prefers a byte-order mark and defaults to UTF-8', () => {
    expect(detectCharset(Buffer.from([0xef, 0xbb, 0xbf, 0x41]), 'text/html; charset=windows-1250')).toBe('utf-8');
    expect(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x41]), null)).toBe('A');
    expect(detectCharset(Buffer.from('ș'), 'text/plain')).toBe('utf-8');
    expect(detectCharset(Buffer.from('x'), 'text/plain; charset=klingon')).toBe('utf-8');
  });

  it('classifies textual content types', () => {
    expect(isTextualContentType('text/csv')).toBe(true);
    expect(isTextualContentType('application/rss+xml')).toBe(true);
    expect(isTextualContentType('application/json; charset=utf-8')).toBe(true);
    expect(isTextualContentType('application/x-gzip')).toBe(false);
    expect(isTextualContentType('application/octet-stream')).toBeNull();
    expect(isTextualContentType(null)).toBeNull();
    expect(looksLikeText(zlib.gzipSync(raw))).toBe(false);
    expect(looksLikeText(raw)).toBe(true);
  });
});
