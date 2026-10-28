/**
 * Founder check (docs/05 M19): `pnpm alerts:simulate <productId> <percent>` sends every active
 * alert on the product a test message as if its best total had dropped by <percent>.
 *
 * Nothing is fabricated: no price event, no offer change, no change to the alert's state. The
 * message says "[SIMULARE]" in the subject and in the first line, and is logged in alert_sends
 * with simulated = true. Its unsubscribe links are real (so they can be tested).
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { alertCandidates, createDb, createPool, queueSimulatedSend } from '@pretoscop/db';
import { deliverSendsNow } from '../alerts/deliver';
import { createAlertServices } from '../services';

loadRootEnvFile();
const [productArg, pctArg] = process.argv.slice(2).filter((a) => a !== '--');
const productId = Number(productArg);
const pct = Number(pctArg ?? 10);
if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(pct) || pct <= 0 || pct >= 90) {
  console.error('usage: pnpm alerts:simulate <productId> <percent between 1 and 89>');
  process.exit(2);
}
const env = getEnv();
const log = createLogger('alerts-simulate');
const pool = createPool(env.DATABASE_URL, 2);
try {
  const db = createDb(pool);
  const candidates = await alertCandidates(db, { productIds: [productId], channels: ['email', 'push', 'telegram'] });
  if (candidates.length === 0) {
    console.log(`No active alert watches product ${productId}. Create one on /p/…-${productId} and confirm it first.`);
    process.exit(1);
  }
  const ids: number[] = [];
  for (const c of candidates) {
    if (!c.best) {
      console.log(`Alert ${c.alertId}: no fresh, in-stock offer right now, so there is no real price to simulate from.`);
      continue;
    }
    const total = Math.round((c.best.totalBani * (100 - pct)) / 100);
    ids.push(await queueSimulatedSend(db, c, total, c.best.totalBani));
  }
  if (ids.length === 0) process.exit(1);
  const r = await deliverSendsNow({ db, log, ...createAlertServices(env, db, log) }, ids);
  console.log(JSON.stringify({ productId, percent: pct, alerts: ids.length, ...r }));
} finally {
  await pool.end();
}
