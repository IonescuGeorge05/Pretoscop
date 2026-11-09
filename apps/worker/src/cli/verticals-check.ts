/**
 * Read-only check (M29): which recorded offers the category-expansion rules would put in the books
 * or beauty vertical (`detectVertical` on the stored title, breadcrumb and GTIN). A vertical is
 * expected only at shops whose registry `categories` name it (`carti` for books, `beauty` or
 * `frumusete` for beauty); anywhere else it would move a launch offer out of its category, so the
 * command exits 1. Run it on the dev database before enabling a new category's sources.
 *
 *   pnpm --filter @pretoscop/worker verticals:check
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { loadShops } from '@pretoscop/config/shops';
import { detectVertical, type Vertical } from '@pretoscop/core';
import { createDb, createPool, sql } from '@pretoscop/db';

const EXPECTED: Record<Vertical, string[]> = { books: ['carti'], beauty: ['beauty', 'frumusete'] };

loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const shopCategories = new Map(loadShops().map((s) => [s.slug, s.categories]));
  const counts = new Map<string, number>();
  const unexpected: string[] = [];
  let total = 0;
  let afterId = 0;
  for (;;) {
    const r = await db.execute<{ id: string; shop: string; title: string; category_raw: string | null; gtin14: string | null }>(sql`
      SELECT o.id::text, s.slug AS shop, coalesce(o.title_clean, o.title_raw) AS title, o.category_raw, o.gtin14
      FROM offers o JOIN shops s ON s.id = o.shop_id
      WHERE o.id > ${afterId} AND o.external_id NOT LIKE 'e2e-fixture-%'
      ORDER BY o.id LIMIT 5000`);
    if (r.rows.length === 0) break;
    for (const o of r.rows) {
      total++;
      const v = detectVertical({ title: o.title, categoryRaw: o.category_raw, gtin14: o.gtin14 });
      if (!v) continue;
      const key = `${o.shop}:${v}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const cats = shopCategories.get(o.shop) ?? [];
      if (!EXPECTED[v].some((c) => cats.includes(c)) && unexpected.length < 20) unexpected.push(`${o.id} ${o.shop} → ${v}: ${o.title} | ${o.category_raw ?? ''}`);
    }
    afterId = Number(r.rows.at(-1)!.id);
  }
  console.log(JSON.stringify({ offers: total, byShopAndVertical: Object.fromEntries(counts), unexpected: unexpected.length }));
  if (unexpected.length) {
    console.error(`FAIL: offers of launch shops would change vertical:\n${unexpected.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
