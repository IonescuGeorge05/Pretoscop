/**
 * Runs the matcher on pending offers and prints each decision with its reasons (M07 founder check).
 *   pnpm --filter @pretoscop/worker match:run [--source emag:listing:telefoane-mobile] [--dry-run] [--limit 30]
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, matchOffer, pendingOffers, syncTaxonomy } from '@pretoscop/db';

loadRootEnvFile();
const { values } = parseArgs({ options: { source: { type: 'string' }, 'dry-run': { type: 'boolean' }, limit: { type: 'string' } } });
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  await syncTaxonomy(db);
  const offers = await pendingOffers(db, Number(values.limit ?? 30), { sourceKey: values.source });
  const counts: Record<string, number> = {};
  for (const o of offers) {
    const out = await matchOffer(db, o, { dryRun: values['dry-run'] });
    counts[out.decision] = (counts[out.decision] ?? 0) + 1;
    console.log(
      `${out.decision.padEnd(12)} ${String(out.score.toFixed(2)).padStart(5)}  ${(out.category ?? '—').padEnd(22)} ${o.title.slice(0, 70).padEnd(70)}  ${out.productId ? `→ #${out.productId}` : ''}  (${out.reasons.join('; ')})`,
    );
  }
  console.log(`\n${offers.length} offers${values['dry-run'] ? ' (dry run, nothing written)' : ''}: ${JSON.stringify(counts)}`);
} finally {
  await pool.end();
}
