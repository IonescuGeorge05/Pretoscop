/**
 * Reads a request body, but never more than `limit` bytes: the stream is cancelled as soon as it
 * goes past the limit, whatever Content-Length said (or did not say: a chunked upload has none), so
 * a stranger cannot make the web process buffer an unbounded body. Null when the body is too large.
 */
export async function readBodyCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
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
