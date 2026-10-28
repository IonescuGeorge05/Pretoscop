/**
 * Founder check (docs/05 M19): `pnpm alerts:simulate <productId> [percent] --email <address>`
 * sends a test message for the active alerts of that address on the product, as if the best total
 * had dropped by <percent>. Only the addresses given with --email (default: ADMIN_EMAILS) receive
 * it, never every subscriber of the product; refused with APP_ENV=prod unless --allow-prod.
 *
 * Nothing is fabricated: no price event, no offer change, no change to the alert's state. The
 * message says "[SIMULARE]" in the subject and in the first line, and is logged in alert_sends
 * with simulated = true. Its unsubscribe links are real (so they can be tested).
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { alertCandidates, createDb, createPool, queueSimulatedSend, sql } from '@pretoscop/db';
import { deliverSendsNow } from '../alerts/deliver';
import { parseSimulateArgs, SIMULATE_USAGE, simulationTargets } from '../alerts/simulate';
import { createAlertServices } from '../services';

loadRootEnvFile();
const env = getEnv();
const args = parseSimulateArgs(process.argv.slice(2), env);
if (!args.ok) {
  console.error(`${args.error}\n${SIMULATE_USAGE}`);
  process.exit(2);
}
const { productId, percent, recipients } = args.value;
const log = createLogger('alerts-simulate');
const pool = createPool(env.DATABASE_URL, 2);
let code = 0;
try {
  const db = createDb(pool);
  const all = await alertCandidates(db, { productIds: [productId], channels: ['email', 'push', 'telegram'] });
  const users = all.length
    ? await db.execute<{ id: string; email: string }>(sql`SELECT id, email FROM users WHERE id = ANY(${sql.param([...new Set(all.map((c) => c.userId))])}::text[])`)
    : { rows: [] };
  const candidates = simulationTargets(all, new Map(users.rows.map((u) => [u.id, u.email])), recipients);
  if (candidates.length === 0) {
    console.log(`No active alert of ${recipients.join(', ')} watches product ${productId}. Create one on /p/…-${productId} and confirm it first.`);
    code = 1;
  } else {
    const ids: number[] = [];
    for (const c of candidates) {
      if (!c.best) {
        console.log(`Alert ${c.alertId}: no fresh, in-stock offer right now, so there is no real price to simulate from.`);
        continue;
      }
      const total = Math.round((c.best.totalBani * (100 - percent)) / 100);
      ids.push(await queueSimulatedSend(db, c, total, c.best.totalBani));
    }
    if (ids.length === 0) code = 1;
    else {
      const r = await deliverSendsNow({ db, log, ...createAlertServices(env, db, log) }, ids);
      console.log(JSON.stringify({ productId, percent, alerts: ids.length, recipients: recipients.length, ...r }));
    }
  }
} finally {
  await pool.end();
}
process.exit(code);
