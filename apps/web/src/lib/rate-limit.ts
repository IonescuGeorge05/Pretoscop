/**
 * Fixed-window, per-process rate limiter keyed by an opaque string (a daily-salted session hash,
 * never a raw IP). Good enough for one web process; a shared store comes with horizontal scaling.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult;
}

export function createRateLimiter({ limit, windowMs, maxKeys = 50_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const buckets = new Map<string, { count: number; reset: number }>();
  return {
    hit(key, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.reset <= now) {
        if (buckets.size >= maxKeys) {
          for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
          if (buckets.size >= maxKeys) buckets.clear();
        }
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
      };
    },
  };
}
