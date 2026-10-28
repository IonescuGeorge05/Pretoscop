/**
 * Request bodies with a hard size limit (M19 and M20 reviews): the read stops and the stream is
 * cancelled as soon as the limit is passed, whatever Content-Length said (or did not say: a chunked
 * body has none), so a stranger cannot make the web process buffer an unbounded body. Pure: no
 * server-only imports.
 */

/** Reads a body stream, never more than `limit` bytes. Null when it is larger. */
export async function readStreamCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A request's body: refused by Content-Length before anything is read, then read with the cap. */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = req.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared.trim()) || Number(declared) > maxBytes)) return null;
  return readStreamCapped(req.body, maxBytes);
}

/** The same, as UTF-8 text. */
export async function readTextCapped(req: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBodyCapped(req, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
