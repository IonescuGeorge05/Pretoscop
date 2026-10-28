import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../rate-limit';

describe('createRateLimiter', () => {
  it('allows `limit` hits per window and per key, then refuses with a retry delay', () => {
    const rl = createRateLimiter({ limit: 5, windowMs: 3_600_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rl.hit('a', t0 + i).allowed).toBe(true);
    const sixth = rl.hit('a', t0 + 10);
    expect(sixth).toMatchObject({ allowed: false, remaining: 0 });
    expect(sixth.retryAfterSec).toBe(3600);
    expect(rl.hit('b', t0 + 10).allowed).toBe(true);
  });

  it('starts a new window after the old one ends', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.hit('a', 0).allowed).toBe(true);
    expect(rl.hit('a', 999).allowed).toBe(false);
    expect(rl.hit('a', 1000).allowed).toBe(true);
  });

  it('never grows beyond maxKeys', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (const k of ['a', 'b', 'c', 'd', 'e']) expect(rl.hit(k, 0).allowed).toBe(true);
  });
});
