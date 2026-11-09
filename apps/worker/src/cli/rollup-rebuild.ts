/**
 * Rebuilds products' whole daily history (M08), for example after a change of the rollup rules or
 * of a shop's trust tier. It only marks the products: the worker's `rollup.history` job rebuilds them
 * in the background, two minutes at a time. `--now` rebuilds here instead (no running worker needed).
 *   pnpm --filter @pretoscop/worker rollup:rebuild --all [--now]
 *   pnpm --filter @pretoscop/worker rollup:rebuild <productId> [<productId> …] [--now]
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, markHistoryDirty, rebuildDirtyHistory, sql } from '@pretoscop/db';

loadRootEnvFile();
const args = process.argv.slice(2);
const all = args.includes('--all');
const now = args.includes('--now');
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!all && ids.length === 0) {
  console.error('usage: rollup:rebuild --all [--now] | rollup:rebuild <productId> [<productId> …] [--now]');
  process.exit(2);
}
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const marked = await markHistoryDirty(db, all ? null : ids);
  console.log(`${marked} product(s) marked for a history rebuild`);
  if (now) {
    let products = 0;
    for (;;) {
      const r = await rebuildDirtyHistory(db, { limit: 200 });
      if (r.products.length === 0) break;
      products += r.products.length;
      process.stdout.write(`\rrebuilt ${products}`);
    }
    console.log(products > 0 ? '' : 'nothing to rebuild');
  } else {
    const left = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM product_history_dirty`);
    console.log(`${left.rows[0]?.n ?? 0} product(s) waiting; the worker's rollup.history job rebuilds them every two minutes`);
  }
} finally {
  await pool.end();
}
