/**
 * Compares N recorded offers with the shop's live pages (M05 founder check). Writes nothing.
 * Polite and identified like every request (fetch layer: robots.txt, per-domain interval, pauses).
 * eMAG: two random listing pages (≈ 60 offers each) — its product pages answered our bot with a
 * CAPTCHA on 27 Oct 2026, so this check never requests them. Other shops: N random product pages.
 *   pnpm --filter @pretoscop/worker compare:live [--n 20] [--shop emag]
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { parsePageDetailed } from '@pretoscop/extractors';
import { createDb, createPool, isFlagEnabled, shops, sql } from '@pretoscop/db';
import { eq } from 'drizzle-orm';
import { createServices } from '../services';

loadRootEnvFile();
const { values } = parseArgs({ options: { n: { type: 'string' }, shop: { type: 'string' } } });
const N = Math.min(20, Number(values.n ?? 20));
const slug = values.shop ?? 'emag';
const env = getEnv();
const log = createLogger('compare-live');
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
const services = createServices(env, db, log);

const lei = (bani: number | null | undefined) => (bani == null ? '—' : `${(bani / 100).toFixed(2)} lei`);

try {
  const [shop] = await db.select().from(shops).where(eq(shops.slug, slug));
  if (!shop) throw new Error(`unknown shop ${slug}`);
  if (!env.CRAWL_ENABLED || !(await isFlagEnabled(db, 'crawl.enabled')) || (slug === 'emag' && !(await isFlagEnabled(db, 'source.emag.enabled')))) {
    console.log('SKIPPED: crawling is off (CRAWL_ENABLED / crawl.enabled / source.emag.enabled)');
    process.exit(0);
  }
  const shopCtx = { id: shop.id, slug: shop.slug, shippingRules: shop.shippingRules ?? {}, vatIncludedDefault: shop.vatIncludedDefault };
  type Row = { id: string; external_id: string; url: string; price: string; availability: string; last_checked_at: string };
  let match = 0;
  let mismatch = 0;
  let skipped = 0;
  const report = (i: number, o: Row, live: { priceBani: number; availability: string } | undefined, why: string, note = '') => {
    const ours = Math.round(Number(o.price) * 100);
    const ageH = ((Date.now() - Date.parse(o.last_checked_at)) / 3_600_000).toFixed(1);
    const same = !!live && live.priceBani === ours && live.availability === o.availability;
    if (same) match++;
    else mismatch++;
    console.log(
      `${String(i + 1).padStart(2)} ${same ? 'match    ' : 'MISMATCH '} ours ${lei(ours)} ${o.availability} (checked ${ageH} h ago) · live ${live ? `${lei(live.priceBani)} ${live.availability}` : why}${note}  ${o.url}`,
    );
  };

  if (slug === 'emag') {
    const pages = await db.execute<{ url: string }>(sql`
      SELECT url FROM shop_sources WHERE shop_id = ${shop.id} AND kind = 'listing' AND enabled AND NOT kill_switch ORDER BY random() LIMIT 2`);
    let i = 0;
    for (const page of pages.rows) {
      const res = await services.fetcher.fetchPolite(page.url, { purpose: 'listing' });
      if (!res.ok || !res.body) {
        skipped++;
        console.log(`   SKIPPED   ${res.skipped ?? `HTTP ${res.status}`}  ${page.url}`);
        if (res.blocked) break;
        continue;
      }
      const observedAt = new Date();
      const parsed = parsePageDetailed('emag-listing', res.body, { url: res.finalUrl ?? page.url, shopSlug: slug, observedAt: observedAt.toISOString() });
      const ids = parsed.offers.map((x) => x.externalId);
      const ours = await db.execute<Row>(sql`
        SELECT id::text, external_id, url, price::text, availability, last_checked_at::text FROM offers
        WHERE shop_id = ${shop.id} AND external_id = ANY(${sql.param(ids)}::text[]) AND active ORDER BY random() LIMIT ${Math.ceil(N / pages.rows.length)}`);
      for (const o of ours.rows) {
        const raw = parsed.offers.find((x) => x.externalId === o.external_id)!;
        const n = services.normalize(raw, { shop: shopCtx, sourceId: 0, sourceTier: 1, runId: null, observedAt });
        report(i++, o, n.observation, n.rejectReason ?? 'not parsed');
      }
    }
    console.log(`\n${match} match, ${mismatch} mismatch, ${skipped} pages skipped (expect ≥ 18 matches of 20; a mismatch is usually a price change since our last check)`);
    process.exit(0);
  }

  const rows = await db.execute<Row>(sql`
    SELECT id::text, external_id, url, price::text, availability, last_checked_at::text FROM offers
    WHERE shop_id = ${shop.id} AND active AND NOT blacklisted AND external_id NOT LIKE 'e2e-fixture-%'
      AND last_checked_at > now() - interval '48 hours'
    ORDER BY random() LIMIT ${N}`);
  for (const [i, o] of rows.rows.entries()) {
    const res = await services.fetcher.fetchPolite(o.url, { purpose: 'product' });
    if (!res.ok || !res.body) {
      skipped++;
      console.log(`${String(i + 1).padStart(2)} SKIPPED   ${res.skipped ?? `HTTP ${res.status}`}  ${o.url}`);
      if (res.blocked) break; // the fetch layer paused the host: stop here
      continue;
    }
    const parsed = parsePageDetailed('jsonld-product', res.body, { url: res.finalUrl ?? o.url, shopSlug: slug, observedAt: new Date().toISOString() });
    const raw = parsed.offers.find((x) => x.externalId === o.external_id) ?? parsed.offers[0];
    const n = raw ? services.normalize(raw, { shop: shopCtx, sourceId: 0, sourceTier: 1, runId: null, observedAt: new Date() }) : null;
    report(i, o, n?.observation, n?.rejectReason ?? 'no offer parsed', raw && raw.externalId !== o.external_id ? ' (other offer on the page)' : '');
  }
  console.log(`\n${match} match, ${mismatch} mismatch, ${skipped} skipped of ${rows.rows.length} (expect ≥ 18 matches of 20; a mismatch is usually a price change since our last check)`);
} finally {
  await services.close();
  await pool.end();
}
