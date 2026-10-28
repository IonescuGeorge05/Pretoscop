import { existsSync } from 'node:fs';

export const dynamic = 'force-dynamic';

/** Created by infra/scripts/deploy.sh in a replica it is about to replace (compose sets DRAIN_FILE). */
const DRAIN_FILE = process.env.DRAIN_FILE ?? '/tmp/pretoscop-draining';

/**
 * Load-balancer readiness (M18), polled by Caddy's active health check every 2 s: 200 while this
 * replica should receive requests, 503 once a deploy has marked it as draining, so Caddy stops
 * sending it new requests before the container is stopped (zero failed requests during a rolling
 * deploy). Deliberately no database check: a short database outage must not empty the pool (the
 * replicas still serve cached pages); `/api/health` is the check that includes the database.
 */
export function GET(): Response {
  const draining = existsSync(DRAIN_FILE);
  return Response.json(
    { status: draining ? 'draining' : 'ready', version: process.env.APP_VERSION ?? 'dev' },
    { status: draining ? 503 : 200, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );
}
