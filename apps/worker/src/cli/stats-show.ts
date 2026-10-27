/**
 * Prints a product's stats and a text sparkline of the last 90 days (M08 founder check).
 *   pnpm --filter @pretoscop/worker stats:show <productId> [--refresh]
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { addDaysIso, bucharestToday, computeProductStats, createDb, createPool, getHistory, rollupProducts } from '@pretoscop/db';
import { sql } from 'drizzle-orm';

loadRootEnvFile();
const id = Number(process.argv[2]);
if (!Number.isInteger(id)) {
  console.error('usage: stats:show <productId> [--refresh]');
  process.exit(2);
}
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  if (process.argv.includes('--refresh')) {
    const today = bucharestToday();
    await rollupProducts(db, { productIds: [id], from: addDaysIso(today, -89), to: today });
    await computeProductStats(db, [id], today);
  }
  const p = await db.execute<{ title: string }>(sql`SELECT title FROM products WHERE id = ${id}`);
  const h = await getHistory(db, id, '90d');
  console.log(`#${id} ${p.rows[0]?.title ?? '(unknown product)'}`);
  console.log(JSON.stringify(h.stats, null, 2));
  const values = h.series.min.map(([, v]) => v);
  if (values.length > 0) {
    const bars = '▁▂▃▄▅▆▇█';
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const byDay = new Map(h.series.min);
    const today = bucharestToday();
    let line = '';
    for (let i = 89; i >= 0; i--) {
      const v = byDay.get(addDaysIso(today, -i));
      line += v === undefined ? '·' : bars[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)];
    }
    console.log(`90 days (· = no observation): ${line}`);
    console.log(`min ${lo.toFixed(2)} lei, max ${hi.toFixed(2)} lei, ${values.length} observed days`);
  }
  for (const [shop, series] of Object.entries(h.series.shops)) {
    console.log(`  ${shop}: ${series.length} days, last ${series.at(-1)?.[1]?.toFixed(2)} lei (${series.at(-1)?.[0]})`);
  }
} finally {
  await pool.end();
}
