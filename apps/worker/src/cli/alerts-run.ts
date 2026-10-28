/**
 * Evaluates and delivers price alerts now, without the job queue (founder checks, e2e tests):
 *   pnpm --filter @pretoscop/worker alerts:run                  every active alert
 *   pnpm --filter @pretoscop/worker alerts:run --products 12,13 only alerts watching these products
 * Same rules as the worker (flags per channel, quiet hours, one message per user and channel).
 *   --now <ISO time>  evaluate and deliver as if it were that time (dev and test only: e2e tests of
 *                     push and Telegram, which wait outside 22:00–08:00 Romania time)
 * Prints one JSON line.
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool } from '@pretoscop/db';
import { deliverAlerts } from '../alerts/deliver';
import { enabledChannels, evaluateAlerts } from '../alerts/evaluate';
import { createAlertServices } from '../services';

loadRootEnvFile();
const { values } = parseArgs({ options: { products: { type: 'string' }, now: { type: 'string' } } });
const env = getEnv();
const now = values.now ? new Date(values.now) : undefined;
if (now && (Number.isNaN(now.getTime()) || (env.APP_ENV !== 'dev' && env.APP_ENV !== 'test'))) {
  console.error('--now takes an ISO time and works only with APP_ENV=dev or test');
  process.exit(2);
}
const log = createLogger('alerts-run');
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  const productIds = values.products ? values.products.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) : null;
  const services = createAlertServices(env, db, log);
  const channels = await enabledChannels(db, services.channels);
  const evaluated = await evaluateAlerts(db, { productIds, channels, log, ...(now ? { now } : {}) });
  const delivered = await deliverAlerts({ db, log, ...services }, { channels, ...(now ? { now } : {}) });
  console.log(JSON.stringify({ channels, evaluated, delivered }));
} finally {
  await pool.end();
}
