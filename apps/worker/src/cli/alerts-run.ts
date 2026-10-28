/**
 * Evaluates and delivers price alerts now, without the job queue (founder checks, e2e tests):
 *   pnpm --filter @pretoscop/worker alerts:run                  every active alert
 *   pnpm --filter @pretoscop/worker alerts:run --products 12,13 only alerts watching these products
 * Same rules as the worker (flags per channel, quiet hours, one message per user and channel).
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
const { values } = parseArgs({ options: { products: { type: 'string' } } });
const env = getEnv();
const log = createLogger('alerts-run');
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  const productIds = values.products ? values.products.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0) : null;
  const channels = await enabledChannels(db);
  const evaluated = await evaluateAlerts(db, { productIds, channels, log });
  const delivered = await deliverAlerts({ db, log, ...createAlertServices(env, db, log) }, { channels });
  console.log(JSON.stringify({ channels, evaluated, delivered }));
} finally {
  await pool.end();
}
