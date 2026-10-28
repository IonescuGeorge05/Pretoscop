import { sql } from '@pretoscop/db';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 2000;

/**
 * Health check for uptime monitors, the Docker HEALTHCHECK and the deploy script (M18):
 * 200 `{status:"ok"}` when this replica can answer and reach the database, 503 otherwise.
 * `version` is the release (APP_VERSION, set in the image) so a deploy can confirm the switch.
 */
export async function GET(): Promise<Response> {
  const started = Date.now();
  let dbOk = false;
  try {
    await Promise.race([
      db().execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)),
    ]);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const body = {
    status: dbOk ? 'ok' : 'error',
    db: dbOk ? 'ok' : 'unreachable',
    version: process.env.APP_VERSION ?? 'dev',
    ms: Date.now() - started,
  };
  return Response.json(body, {
    status: dbOk ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
