import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';

const CHUNK = 500;

/**
 * The web replicas to notify: WEB_INTERNAL_URL is one URL or a comma-separated list (production
 * runs two replicas, and each keeps its own page cache, so each must hear about every change).
 * Empty → PUBLIC_BASE_URL.
 */
export function revalidateTargets(env: Pick<Env, 'WEB_INTERNAL_URL' | 'PUBLIC_BASE_URL'>): string[] {
  const list = (env.WEB_INTERNAL_URL ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  return (list.length > 0 ? list : [env.PUBLIC_BASE_URL]).map((u) => `${u.replace(/\/+$/, '')}/api/revalidate`);
}

/**
 * Tells the web app that cached pages are out of date (POST /api/revalidate, M13 contract): tags
 * `product:{id}` after a price change, `products` after the nightly rollup. Best effort: a replica
 * that is down or unreachable only delays its refresh to the page's own revalidate window (1 h).
 * Returns how many tags the first replica accepted (all replicas get the same tags).
 */
export function createRevalidator(env: Env, log: Logger) {
  const urls = revalidateTargets(env);

  async function post(url: string, tags: string[]): Promise<number> {
    let done = 0;
    for (let i = 0; i < tags.length; i += CHUNK) {
      const chunk = tags.slice(i, i + CHUNK);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.REVALIDATE_TOKEN}` },
          body: JSON.stringify({ tags: chunk }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          log.warn({ status: res.status, url }, 'web revalidation refused');
          return done;
        }
        done += chunk.length;
      } catch (err) {
        log.debug({ err: (err as Error).message, url }, 'web revalidation unreachable');
        return done;
      }
    }
    return done;
  }

  return async (tags: string[]): Promise<number> => {
    if (tags.length === 0) return 0;
    const results = await Promise.all(urls.map((u) => post(u, tags)));
    return results[0] ?? 0;
  };
}
