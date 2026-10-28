/**
 * Request bodies with a hard size limit: refused by `Content-Length` before anything is read, and
 * the read stops as soon as the limit is passed (a chunked body without a length cannot make the
 * process buffer more than `maxBytes`). Pure: no server-only imports.
 */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = req.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared.trim()) || Number(declared) > maxBytes)) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The same, as UTF-8 text. */
export async function readTextCapped(req: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBodyCapped(req, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
