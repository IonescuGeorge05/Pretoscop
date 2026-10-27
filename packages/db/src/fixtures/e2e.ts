import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { decideManually } from '../queries/matching';
import { recordObservation, type OfferObservation } from '../queries/offers';
import { addDaysIso, bucharestToday, computeProductStats, rollupProducts } from '../queries/rollup';

/**
 * A throwaway product for the product-page end-to-end tests (M13): six offers at active shops with
 * ten days of observations, created through the real recording, matching and rollup functions.
 * Everything it creates is marked (`e2e-fixture-` external ids, "(produs de test E2E)" in the
 * title) and removed by `dropE2eFixture`. Provisional, so it is never indexed.
 */
export const E2E_TITLE = 'Telefon mobil Testoscop X1, Dual SIM, 128GB, 8GB RAM, 5G, Negru (produs de test E2E)';
const PREFIX = 'e2e-fixture-';

interface Step {
  daysAgo: number;
  price: number;
  shipping: number | null;
  availability?: OfferObservation['availability'];
  oldPrice?: number;
}
interface FixtureOffer {
  key: string;
  shop: string;
  sellerType?: 'shop' | 'marketplace';
  sellerName?: string;
  condition?: OfferObservation['condition'];
  steps: Step[];
}

// Default order on the page (used/refurbished hidden): emag-mp, itgalaxy, forit, emag, elefant (out of stock).
const OFFERS: FixtureOffer[] = [
  { key: 'emag', shop: 'emag', steps: [{ daysAgo: 9, price: 2399.99, shipping: 0 }, { daysAgo: 6, price: 2299.99, shipping: 0 }, { daysAgo: 3, price: 2249.99, shipping: 0, oldPrice: 2499.99 }] },
  { key: 'emag-mp', shop: 'emag', sellerType: 'marketplace', sellerName: 'Gadget Store SRL', steps: [{ daysAgo: 5, price: 2189, shipping: 19.99 }, { daysAgo: 2, price: 2149, shipping: 19.99 }] },
  { key: 'itgalaxy', shop: 'itgalaxy', steps: [{ daysAgo: 9, price: 2249, shipping: null }, { daysAgo: 4, price: 2179, shipping: null }] },
  { key: 'forit', shop: 'forit', steps: [{ daysAgo: 9, price: 2199, shipping: 25 }] },
  { key: 'flip', shop: 'flip', condition: 'refurbished', steps: [{ daysAgo: 7, price: 1799, shipping: 0 }] },
  { key: 'elefant', shop: 'elefant', steps: [{ daysAgo: 9, price: 2099, shipping: 0 }, { daysAgo: 2, price: 2099, shipping: 0, availability: 'out_of_stock' }] },
];

export interface E2eFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
}

const bani = (lei: number) => Math.round(lei * 100);

export async function createE2eFixture(db: Db): Promise<E2eFixture> {
  await dropE2eFixture(db);
  const shops = await db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops WHERE slug IN ('emag','itgalaxy','forit','flip','elefant')`);
  const shopId = new Map(shops.rows.map((r) => [r.slug, Number(r.id)]));
  const now = Date.now();
  const ids: Record<string, number> = {};
  for (const o of OFFERS) {
    const sid = shopId.get(o.shop);
    if (!sid) throw new Error(`e2e fixture: shop ${o.shop} missing (run make seed)`);
    // A check every day like the recorder (no gaps), in the state of the latest step; the last
    // check is one hour ago, so the offer is fresh. Unchanged checks write no event.
    for (let d = o.steps[0]!.daysAgo; d >= 0; d--) {
      const s = o.steps.filter((x) => x.daysAgo >= d).at(-1)!;
      const observedAt = new Date(d === 0 ? now - 3600_000 : now - d * 86_400_000);
      const availability = s.availability ?? 'in_stock';
      const r = await recordObservation(db, {
        shopId: sid,
        sourceId: null,
        sourceTier: 1,
        runId: null,
        externalId: `${PREFIX}${o.key}`,
        url: `https://example.com/e2e/${o.key}`,
        titleRaw: E2E_TITLE,
        titleClean: E2E_TITLE,
        attributes: { kind: 'phone', storageGb: 128, ramGb: 8, color: 'black', colorRo: 'negru', connectivity: ['5g', 'dual_sim'] },
        priceBani: bani(s.price),
        oldPriceBani: s.oldPrice ? bani(s.oldPrice) : null,
        shippingBani: s.shipping === null ? null : bani(s.shipping),
        totalBani: bani(s.price + (s.shipping ?? 0)),
        availability,
        condition: o.condition ?? 'new',
        sellerType: o.sellerType ?? 'shop',
        sellerName: o.sellerName ?? null,
        contentHash: createHash('sha256').update(`${s.price}|${s.shipping}|${availability}|${s.oldPrice ?? ''}`).digest('hex'),
        observedAt,
      });
      if (r.offerId) ids[o.key] = r.offerId;
    }
  }
  const productId = await decideManually(db, ids.emag!, { kind: 'new_product' }, 'e2e-fixture');
  if (!productId) throw new Error('e2e fixture: product not created');
  for (const o of OFFERS) if (o.key !== 'emag') await decideManually(db, ids[o.key]!, { kind: 'accept', productId }, 'e2e-fixture');
  await db.execute(sql`UPDATE products SET provisional = true WHERE id = ${productId}`);
  const today = bucharestToday();
  await rollupProducts(db, { productIds: [productId], from: addDaysIso(today, -10), to: today });
  await computeProductStats(db, [productId], today);

  const p = await db.execute<{ slug: string }>(sql`SELECT slug FROM products WHERE id = ${productId}`);
  const totals = await db.execute<{ external_id: string; id: string; total: string }>(
    sql`SELECT external_id, id::text, total_price::text AS total FROM offers WHERE external_id LIKE ${`${PREFIX}%`}`,
  );
  return {
    productId,
    slug: p.rows[0]!.slug,
    offers: Object.fromEntries(totals.rows.map((r) => [r.external_id.slice(PREFIX.length), { offerId: Number(r.id), total: r.total }])),
  };
}

/** Clicks logged for the fixture's offers (the click-out test checks one was written). */
export async function e2eFixtureClicks(db: Db): Promise<Array<{ offerId: number; placement: string | null; ipHash: string | null }>> {
  const r = await db.execute<{ offer_id: string; placement: string | null; ip_hash: string | null }>(sql`
    SELECT offer_id::text, placement, ip_hash FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${`${PREFIX}%`}) ORDER BY ts`);
  return r.rows.map((c) => ({ offerId: Number(c.offer_id), placement: c.placement, ipHash: c.ip_hash }));
}

/** Removes everything the fixture created (offers cascade to events, gaps and decisions). */
export async function dropE2eFixture(db: Db): Promise<number> {
  const like = `${PREFIX}%`;
  const products = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT product_id::text AS id FROM offers WHERE external_id LIKE ${like} AND product_id IS NOT NULL
    UNION SELECT id::text FROM products WHERE title = ${E2E_TITLE}
  `);
  const productIds = products.rows.map((r) => Number(r.id));
  await db.execute(sql`DELETE FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${like})`);
  await db.execute(sql`DELETE FROM offer_aliases WHERE external_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM offers WHERE external_id LIKE ${like}`);
  if (productIds.length) await db.execute(sql`DELETE FROM products WHERE id = ANY(${sql.param(productIds)}::bigint[])`);
  return productIds.length;
}
