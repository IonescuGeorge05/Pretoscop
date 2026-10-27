/**
 * Rollup performance check (M08 acceptance: 1M events < 5 minutes on the dev machine).
 * Creates a throwaway database, generates 1,000,000 synthetic price events (5,000 products,
 * 20,000 offers, 120 days), runs the full rollup and the stats, prints timings, drops the database.
 *   pnpm --filter @pretoscop/db perf:rollup
 */
import { sql } from 'drizzle-orm';
import { addDaysIso, bucharestToday, computeProductStats, rollupProducts } from '../queries/rollup';
import { seedDev } from '../seed';
import { createTestDatabase } from '../testing';

const t = await createTestDatabase();
try {
  await seedDev(t.db);
  const today = bucharestToday();
  const from = addDaysIso(today, -119);
  const t0 = Date.now();
  await t.db.execute(sql`INSERT INTO products (slug, title, title_ascii) SELECT 'p' || g, 'Produs ' || g, 'produs ' || g FROM generate_series(1, 5000) g`);
  await t.db.execute(sql`
    INSERT INTO offers (shop_id, source_tier, external_id, product_id, url, title_raw, price, total_price, availability,
      condition, seller_type, match_status, first_seen_at, last_seen_at, last_checked_at, price_changed_at, content_hash)
    SELECT (SELECT id FROM shops WHERE slug = CASE WHEN g % 2 = 0 THEN 'emag' ELSE 'dedeman' END), 1, 'o' || g,
      (SELECT min(id) FROM products) + (g % 5000), 'https://x.ro/' || g, 'Oferta ' || g, 100, 100, 'in_stock', 'new',
      CASE WHEN g % 10 = 0 THEN 'marketplace' ELSE 'shop' END, 'auto',
      ${from}::date::timestamptz, now(), now(), now(), 'h'
    FROM generate_series(1, 20000) g`);
  // 50 events per offer spread over 120 days → 1,000,000 events.
  await t.db.execute(sql`
    INSERT INTO price_events (offer_id, observed_at, price, availability, kind)
    SELECT o.id, ${from}::date::timestamptz + (e * interval '57 hours') + (o.id % 3600) * interval '1 second',
      round((50 + random() * 2000)::numeric, 2), CASE WHEN random() < 0.05 THEN 'out_of_stock' ELSE 'in_stock' END, 'change'
    FROM offers o CROSS JOIN generate_series(0, 49) e`);
  const n = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM price_events`);
  console.log(`generated ${n.rows[0]?.n} events in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await t.db.execute(sql`ANALYZE`);

  const t1 = Date.now();
  const rows = await rollupProducts(t.db, { productIds: null, from, to: today });
  const rollupS = (Date.now() - t1) / 1000;
  console.log(`rollup: ${rows} product-days in ${rollupS.toFixed(1)} s`);
  const t2 = Date.now();
  const stats = await computeProductStats(t.db, null, today);
  console.log(`stats: ${stats} products in ${((Date.now() - t2) / 1000).toFixed(1)} s`);
  const t3 = Date.now();
  await rollupProducts(t.db, { productIds: null, from: addDaysIso(today, -2), to: today });
  console.log(`nightly window (3 days, all products): ${((Date.now() - t3) / 1000).toFixed(1)} s`);
  if (rollupS > 300) {
    console.error('FAIL: full rollup over 1M events took more than 5 minutes');
    process.exitCode = 1;
  } else console.log('OK: full rollup under 5 minutes');
} finally {
  await t.drop();
}
