import { describe, expect, it } from 'vitest';
import { readBodyCapped, readTextCapped } from '@/lib/body';

/** A chunked body (no Content-Length) that would grow forever if read without a limit. */
function endless(chunk: number): { req: Request; pulled: () => number } {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += chunk;
      controller.enqueue(new Uint8Array(chunk));
    },
  });
  const req = new Request('http://x.test/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  return { req, pulled: () => pulled };
}

describe('readBodyCapped', () => {
  it('reads a body within the limit', async () => {
    const req = new Request('http://x.test/', { method: 'POST', body: '{"a":"ăîșț"}' });
    expect(await readTextCapped(req, 64)).toBe('{"a":"ăîșț"}');
  });

  it('refuses by Content-Length before reading anything', async () => {
    let read = false;
    // highWaterMark 0: the stream is pulled only when someone reads it.
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          read = true;
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request('http://x.test/', { method: 'POST', body: stream, headers: { 'content-length': '999999' }, duplex: 'half' } as RequestInit);
    expect(await readBodyCapped(req, 1024)).toBeNull();
    expect(read).toBe(false);
  });

  it('stops a chunked body as soon as it passes the limit', async () => {
    const { req, pulled } = endless(4096);
    expect(await readBodyCapped(req, 10_000)).toBeNull();
    expect(pulled()).toBeLessThan(20_000);
  });

  it('refuses a malformed Content-Length', async () => {
    const req = new Request('http://x.test/', { method: 'POST', body: 'x', headers: { 'content-length': '-1' } });
    expect(await readBodyCapped(req, 10)).toBeNull();
  });
});
