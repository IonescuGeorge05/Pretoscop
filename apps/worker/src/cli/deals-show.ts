/**
 * Prints what /reduceri shows (M15 founder check), read-only on the database.
 *   pnpm --filter @pretoscop/worker deals:show [category-slug] [--days 7]
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { dropBadgeText, formatLei } from '@pretoscop/core';
import { bucharestToday, createDb, createPool, getDeals } from '@pretoscop/db';

loadRootEnvFile();
const env = getEnv();
const args = process.argv.slice(2);
const daysAt = args.indexOf('--days');
const windowDays = daysAt >= 0 ? Number(args[daysAt + 1]) : 7;
const category = args.find((a, i) => !a.startsWith('--') && i !== daysAt + 1) ?? null;
const pool = createPool(env.DATABASE_URL, 2);
try {
  const d = await getDeals(createDb(pool), { windowDays, category }, bucharestToday());
  console.log(`today ${d.today} · history since ${d.historyStartedAt ?? '—'} · ${d.eligibleProducts} products with ≥ 14 days · window ${windowDays} days${category ? ` · ${category}` : ''}`);
  console.log(`\nverified drops (${d.drops.length}):`);
  for (const x of d.drops.slice(0, 20)) {
    console.log(`  ${String(x.id).padStart(6)}  ${dropBadgeText(x.drop!).padEnd(40)}  ${formatLei(x.currentBani).padStart(14)} (ref ${formatLei(x.drop!.referenceBani)}, since ${x.drop!.since})${x.allTimeLow ? '  minim istoric' : ''}  ${x.title.slice(0, 70)}`);
  }
  console.log(`\nat a 30-day low (${d.lows30.length}):`);
  for (const x of d.lows30.slice(0, 10)) console.log(`  ${String(x.id).padStart(6)}  ${formatLei(x.currentBani).padStart(14)}  ${x.title.slice(0, 80)}`);
} finally {
  await pool.end();
}
