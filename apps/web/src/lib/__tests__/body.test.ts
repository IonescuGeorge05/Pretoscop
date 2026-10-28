import { describe, expect, it } from 'vitest';
import { readBodyCapped } from '../body';

/** A chunked body with no length: what a stranger streaming an endless upload sends. */
function stream(chunks: number, size: number) {
  let sent = 0;
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      if (sent >= chunks) return controller.close();
      sent++;
      controller.enqueue(new Uint8Array(size).fill(0x41));
    },
  });
  return { body, pulled: () => pulled };
}

describe('readBodyCapped', () => {
  it('returns the whole body under the limit', async () => {
    const { body } = stream(3, 1000);
    expect((await readBodyCapped(body, 3000))?.byteLength).toBe(3000);
  });

  it('stops reading and cancels as soon as the limit is passed (no Content-Length needed)', async () => {
    const { body, pulled } = stream(1_000_000, 64 * 1024);
    expect(await readBodyCapped(body, 1024 * 1024)).toBeNull();
    expect(pulled()).toBeLessThan(20);
  });

  it('treats a missing body as empty', async () => {
    expect((await readBodyCapped(null, 10))?.byteLength).toBe(0);
  });
});
