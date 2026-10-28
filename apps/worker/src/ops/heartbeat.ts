import type { Logger } from '@pretoscop/config/logger';

/**
 * Pings a dead-man's-switch URL (Better Stack heartbeat or healthchecks.io check): success pings
 * GET <url>, failures GET <url>/fail (both services accept that form). A missing ping within the
 * monitor's period is what alerts, so a dead worker or server is noticed from outside. Never throws.
 */
export async function pingHeartbeat(url: string | undefined, log: Logger, outcome: 'ok' | 'fail' = 'ok'): Promise<boolean> {
  if (!url) return false;
  const target = outcome === 'fail' ? `${url.replace(/\/+$/, '')}/fail` : url;
  try {
    const res = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) log.warn({ status: res.status }, 'heartbeat ping refused');
    return res.ok;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'heartbeat ping failed');
    return false;
  }
}
