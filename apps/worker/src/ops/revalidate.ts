import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';

const CHUNK = 500;

/**
 * Tells the web app that cached pages are out of date (POST /api/revalidate, M13 contract): tags
 * `product:{id}` after a price change, `products` after the nightly rollup. Best effort: a web app
 * that is down or unreachable only delays the refresh to the page's own revalidate window (1 h).
 */
export function createRevalidator(env: Env, log: Logger) {
  const url = `${(env.WEB_INTERNAL_URL ?? env.PUBLIC_BASE_URL).replace(/\/+$/, '')}/api/revalidate`;
  return async (tags: string[]): Promise<number> => {
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
  };
}
