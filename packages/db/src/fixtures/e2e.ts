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
  /** Admin flows (M09): two duplicate products and a review-queue offer whose candidate is `dupA`. */
  admin: { dupA: number; dupB: number; dupBSlug: string; reviewOfferId: number; reviewTitle: string };
  /** Search, browse, deals and SEO flows (M14–M16): brand Testoscop, see `createSearchFixture`. */
  search: SearchFixture;
}

const MARK = '(produs de test E2E)';
const ADMIN_OFFERS = [
  { key: 'y-a', shop: 'auchan', title: `Telefon mobil Testoscop Y2, 256GB, Albastru ${MARK}`, price: 1499 },
  { key: 'y-b', shop: 'carrefour', title: `Smartphone Testoscop Y2 256 GB albastru ${MARK}`, price: 1529 },
  { key: 'review', shop: 'elefant', title: `Testoscop Y2 256GB albastru telefon ${MARK}`, price: 1519 },
];

const bani = (lei: number) => Math.round(lei * 100);

export async function createE2eFixture(db: Db): Promise<E2eFixture> {
  await dropE2eFixture(db);
  const shops = await db.execute<{ slug: string; id: string; domain: string }>(sql`SELECT slug, id::text, domain FROM shops WHERE slug IN ('emag','itgalaxy','forit','flip','elefant','auchan','carrefour')`);
  const shopId = new Map(shops.rows.map((r) => [r.slug, Number(r.id)]));
  const shopDomain = new Map(shops.rows.map((r) => [r.slug, r.domain]));
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
        // On the shop's own domain, like a real offer (affiliate links refuse other hosts); never fetched.
        url: `https://www.${shopDomain.get(o.shop)}/e2e-fixture/${o.key}`,
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

  const admin = await createAdminFixture(db, shopId, now);
  const search = await createSearchFixture(db, shopId, now);

  const p = await db.execute<{ slug: string }>(sql`SELECT slug FROM products WHERE id = ${productId}`);
  const totals = await db.execute<{ external_id: string; id: string; total: string }>(
    sql`SELECT external_id, id::text, total_price::text AS total FROM offers WHERE external_id LIKE ${`${PREFIX}%`}`,
  );
  return {
    productId,
    slug: p.rows[0]!.slug,
    offers: Object.fromEntries(totals.rows.map((r) => [r.external_id.slice(PREFIX.length), { offerId: Number(r.id), total: r.total }])),
    admin,
    search,
  };
}

async function createAdminFixture(db: Db, shopId: Map<string, number>, now: number): Promise<E2eFixture['admin']> {
  const ids: Record<string, number> = {};
  for (const o of ADMIN_OFFERS) {
    const r = await recordObservation(db, {
      shopId: shopId.get(o.shop)!,
      sourceId: null,
      sourceTier: 1,
      runId: null,
      externalId: `${PREFIX}${o.key}`,
      url: `https://example.com/e2e/${o.key}`,
      titleRaw: o.title,
      titleClean: o.title,
      attributes: { kind: 'phone', storageGb: 256, color: 'blue' },
      priceBani: bani(o.price),
      shippingBani: 0,
      totalBani: bani(o.price),
      availability: 'in_stock',
      condition: 'new',
      contentHash: createHash('sha256').update(`${o.key}|${o.price}`).digest('hex'),
      observedAt: new Date(now - 3600_000),
    });
    ids[o.key] = r.offerId!;
  }
  const dupA = (await decideManually(db, ids['y-a']!, { kind: 'new_product' }, 'e2e-fixture'))!;
  const dupB = (await decideManually(db, ids['y-b']!, { kind: 'new_product' }, 'e2e-fixture'))!;
  await db.execute(sql`UPDATE products SET provisional = true WHERE id IN (${dupA}, ${dupB})`);
  // A gray-zone item exactly as the matcher leaves one: pending, scored, with its candidate.
  const review = ids.review!;
  await db.execute(sql`UPDATE offers SET match_status = 'pending', matched_at = now(), match_score = 0.74, match_reason = 'title 0.74 in gray zone' WHERE id = ${review}`);
  await db.execute(sql`INSERT INTO match_candidates (offer_id, product_id, score, features, generator) VALUES (${review}, ${dupA}, 0.74, '{"conflicts":[],"via":"title"}'::jsonb, 'title')`);
  await db.execute(sql`INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score) VALUES (${review}, NULL, 'needs_review', 'rule', 'title 0.74 in gray zone', 0.74)`);
  const slug = await db.execute<{ slug: string }>(sql`SELECT slug FROM products WHERE id = ${dupB}`);
  return { dupA, dupB, dupBSlug: slug.rows[0]!.slug, reviewOfferId: review, reviewTitle: ADMIN_OFFERS[2]!.title };
}

/**
 * Affiliate e2e (M24): a temporary approved 2Performant program for forit that allows comparators,
 * with the flag on; `affiliateSyncForbidden` runs the real program sync with forit's permission
 * set to "no"; `affiliateRestore` removes the program and puts the flag back.
 */
export async function affiliateAllow(db: Db): Promise<{ flagWas: boolean }> {
  const f = await db.execute<{ enabled: boolean }>(sql`SELECT enabled FROM feature_flags WHERE key = 'affiliate.links.enabled'`);
  await db.execute(sql`
    INSERT INTO affiliate_programs (shop_id, network, program_external_id, comparator_policy, status, notes)
    SELECT id, '2performant', 'e2e-unique', 'allowed', 'approved', 'e2e fixture' FROM shops WHERE slug = 'forit'
    ON CONFLICT (shop_id, network) DO UPDATE SET program_external_id = 'e2e-unique', comparator_policy = 'allowed', status = 'approved', notes = 'e2e fixture'`);
  await db.execute(sql`INSERT INTO feature_flags (key, enabled) VALUES ('affiliate.links.enabled', true) ON CONFLICT (key) DO UPDATE SET enabled = true`);
  return { flagWas: f.rows[0]?.enabled ?? false };
}

export async function affiliateSyncForbidden(db: Db): Promise<number> {
  const { applyTwoPerformantPrograms } = await import('../queries/affiliate');
  const res = await applyTwoPerformantPrograms(
    db,
    [{ id: 990001, name: 'forit (e2e)', main_url: 'https://www.forit.ro', unique_code: 'e2e-unique', affrequest: { status: 'accepted' }, traffic_sources: [{ name: 'Price Comparison Services', usage: 'no' }] }],
    'e2e-fixture',
    new Date().toISOString().slice(0, 10),
  );
  return res.changes.length;
}

export async function affiliateRestore(db: Db, flagWas: boolean): Promise<void> {
  await db.execute(sql`DELETE FROM affiliate_programs WHERE network = '2performant' AND program_external_id = 'e2e-unique'`);
  await db.execute(sql`UPDATE feature_flags SET enabled = ${flagWas} WHERE key = 'affiliate.links.enabled'`);
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
    UNION SELECT id::text FROM products WHERE title = ${E2E_TITLE} OR title LIKE ${`%${MARK}`}
  `);
  const productIds = products.rows.map((r) => Number(r.id));
  // Accounts of the alert e2e flows (M19); their alerts go with the products below anyway.
  await db.execute(sql`DELETE FROM consent_records WHERE user_id IN (SELECT id FROM users WHERE email LIKE ${E2E_ALERT_EMAIL_LIKE})`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${E2E_ALERT_EMAIL_LIKE}`);
  await db.execute(sql`DELETE FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${like})`);
  await db.execute(sql`DELETE FROM offer_aliases WHERE external_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM offers WHERE external_id LIKE ${like}`);
  // Throwaway shops of the admin e2e flows (M21 outreach): never crawled, no offers; cascades remove their rows.
  await db.execute(sql`DELETE FROM shops WHERE slug LIKE ${like} AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.shop_id = shops.id)`);
  if (productIds.length) {
    const ids = sql.param(productIds);
    await db.execute(sql`DELETE FROM product_merges WHERE from_product_id = ANY(${ids}::bigint[]) OR into_product_id = ANY(${ids}::bigint[])`);
    await db.execute(sql`UPDATE products SET merged_into_id = NULL WHERE id = ANY(${ids}::bigint[])`);
    await db.execute(sql`DELETE FROM products WHERE id = ANY(${ids}::bigint[])`);
  }
  await db.execute(sql`DELETE FROM brands b WHERE b.slug = ${SEARCH_BRAND.slug} AND NOT EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id)`);
  return productIds.length;
}

// ---------------------------------------------------------------------------------------------
// Search, browse, deals and SEO (M14–M16)

export const SEARCH_BRAND = { name: 'Testoscop', slug: 'testoscop' } as const;

export interface SearchFixture {
  brandSlug: string;
  /** Two live offers, not provisional: indexable (sitemaps, ItemList). */
  tv: { id: number; slug: string; title: string };
  /** One offer, no history: listed and searchable, but not indexable. */
  phone: { id: number; slug: string; title: string };
  /** 45 days at 2.000 lei, then 1.700 lei for the last 4 days: a verified −15% drop and an all-time low. */
  deal: { id: number; slug: string; title: string; dropSince: string };
  /**
   * A subcategory with no active product in the database (so none in an index built from it), for
   * the "empty category" page; null once every subcategory has products.
   */
  emptyCategory: { path: string; name: string } | null;
}

interface SearchProduct {
  key: 'tv' | 'phone' | 'deal';
  title: string;
  category: string;
  attributes: Record<string, unknown>;
  offers: Array<{ shop: string; steps: Array<{ daysAgo: number; price: number }> }>;
}

const SEARCH_PRODUCTS: SearchProduct[] = [
  {
    key: 'tv',
    title: `Televizor Testoscop Vision 55TV1, 139 cm, Smart, 4K Ultra HD ${MARK}`,
    category: 'televizoare',
    attributes: { kind: 'tv', screenInches: 55, resolution: '4k' },
    offers: [
      { shop: 'emag', steps: [{ daysAgo: 2, price: 2999 }] },
      { shop: 'itgalaxy', steps: [{ daysAgo: 2, price: 2899 }] },
    ],
  },
  {
    key: 'phone',
    title: `Telefon mobil Testoscop Y5, 128GB, 5G, Negru ${MARK}`,
    category: 'telefoane-mobile',
    attributes: { kind: 'phone', storageGb: 128, color: 'black', colorRo: 'negru', connectivity: ['5g'] },
    offers: [{ shop: 'emag', steps: [{ daysAgo: 1, price: 999 }] }],
  },
  {
    key: 'deal',
    title: `Consola Testoscop Play 5, 1TB ${MARK}`,
    category: 'console',
    attributes: { kind: 'console', storageGb: 1024 },
    offers: [{ shop: 'emag', steps: [{ daysAgo: 45, price: 2000 }, { daysAgo: 4, price: 1700 }] }],
  },
];

const slugPart = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

async function createSearchFixture(db: Db, shopId: Map<string, number>, now: number): Promise<SearchFixture> {
  const brand = await db.execute<{ id: string }>(sql`
    INSERT INTO brands (name, slug) VALUES (${SEARCH_BRAND.name}, ${SEARCH_BRAND.slug})
    ON CONFLICT (slug) DO UPDATE SET name = brands.name RETURNING id::text`);
  const brandId = Number(brand.rows[0]!.id);
  const out: Partial<Record<SearchProduct['key'], { id: number; slug: string; title: string }>> = {};
  const productIds: number[] = [];
  for (const p of SEARCH_PRODUCTS) {
    const ins = await db.execute<{ id: string }>(sql`
      INSERT INTO products (slug, title, title_ascii, brand_id, category_id, attributes, provisional, created_by)
      VALUES (${`tmp-e2e-${p.key}-${now}`}, ${p.title}, ${slugPart(p.title).replace(/-/g, ' ')}, ${brandId},
        (SELECT id FROM categories WHERE slug = ${p.category}), ${JSON.stringify(p.attributes)}::jsonb, false, 'manual')
      RETURNING id::text`);
    const id = Number(ins.rows[0]!.id);
    const slug = `${slugPart(p.title)}-${id}`;
    await db.execute(sql`UPDATE products SET slug = ${slug} WHERE id = ${id}`);
    productIds.push(id);
    out[p.key] = { id, slug, title: p.title };
    for (const o of p.offers) {
      const sid = shopId.get(o.shop);
      if (!sid) throw new Error(`e2e fixture: shop ${o.shop} missing (run make seed)`);
      const externalId = `${PREFIX}${p.key}-${o.shop}`;
      // One check a day like the recorder; unchanged checks write no event.
      for (let d = o.steps[0]!.daysAgo; d >= 0; d--) {
        const s = o.steps.filter((x) => x.daysAgo >= d).at(-1)!;
        const r = await recordObservation(db, {
          shopId: sid,
          sourceId: null,
          sourceTier: 1,
          runId: null,
          externalId,
          url: `https://example.com/e2e/${p.key}-${o.shop}`,
          titleRaw: p.title,
          titleClean: p.title,
          attributes: p.attributes,
          priceBani: bani(s.price),
          shippingBani: 0,
          totalBani: bani(s.price),
          availability: 'in_stock',
          condition: 'new',
          contentHash: createHash('sha256').update(`${externalId}|${s.price}`).digest('hex'),
          observedAt: new Date(d === 0 ? now - 3600_000 : now - d * 86_400_000),
        });
        if (r.offerId) await db.execute(sql`UPDATE offers SET product_id = ${id}, match_status = 'manual', matched_at = now() WHERE id = ${r.offerId} AND product_id IS NULL`);
      }
    }
  }
  const today = bucharestToday();
  await rollupProducts(db, { productIds, from: addDaysIso(today, -46), to: today });
  await computeProductStats(db, productIds, today);
  const empty = await db.execute<{ path: string; name: string }>(sql`
    SELECT c.path, c.name_ro AS name FROM categories c
    WHERE c.parent_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM products p JOIN categories pc ON pc.id = p.category_id WHERE p.status = 'active' AND (pc.id = c.id OR pc.path LIKE c.path || '/%'))
    ORDER BY c.path LIMIT 1`);
  return {
    brandSlug: SEARCH_BRAND.slug,
    tv: out.tv!,
    phone: out.phone!,
    deal: { ...out.deal!, dropSince: addDaysIso(today, -4) },
    emptyCategory: empty.rows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Price alerts (M19): a separate throwaway product, so a synthetic price drop never disturbs the
// product-page fixture above. Same markers (`e2e-fixture-` ids, "(produs de test E2E)" title), so
// `dropE2eFixture` removes it too; `dropAlertsFixture` removes only this one.

/** Test addresses of the alert flows: `alerte-e2e-…@pretoscop.test`. */
export const E2E_ALERT_EMAIL_LIKE = 'alerte-e2e-%@pretoscop.test';
const ALERTS_PREFIX = `${PREFIX}alerts-`;
export const E2E_ALERTS_TITLE = `Telefon mobil Testoscop Z3, 256GB, 12GB RAM, Verde ${MARK}`;
const ALERT_OFFERS = [
  { key: 'a', shop: 'itgalaxy', price: 1499 },
  { key: 'b', shop: 'forit', price: 1549 },
];

export interface E2eAlertsFixture {
  productId: number;
  slug: string;
  offers: Record<string, { offerId: number; total: string }>;
  /** `alerts.email.enabled` before the fixture turned it on (restored by the drop). */
  flagWas: boolean;
}

async function observeAlertOffer(db: Db, shopId: number, key: string, lei: number, observedAt: Date): Promise<number> {
  const priceBani = bani(lei);
  const r = await recordObservation(db, {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId: `${ALERTS_PREFIX}${key}`,
    url: `https://example.com/e2e/alerts-${key}`,
    titleRaw: E2E_ALERTS_TITLE,
    titleClean: E2E_ALERTS_TITLE,
    attributes: { kind: 'phone', storageGb: 256, ramGb: 12, color: 'green', colorRo: 'verde' },
    priceBani,
    shippingBani: 0,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    contentHash: createHash('sha256').update(`alerts|${key}|${lei}`).digest('hex'),
    observedAt,
  });
  return r.offerId!;
}

export async function createAlertsFixture(db: Db): Promise<E2eAlertsFixture> {
  const flag = await db.execute<{ enabled: boolean }>(sql`SELECT enabled FROM feature_flags WHERE key = 'alerts.email.enabled'`);
  const flagWas = flag.rows[0]?.enabled ?? false;
  await dropAlertsFixture(db, { emailHashes: [] });
  const shops = await db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops WHERE slug IN ('itgalaxy','forit')`);
  const shopId = new Map(shops.rows.map((r) => [r.slug, Number(r.id)]));
  const ids: Record<string, number> = {};
  for (const o of ALERT_OFFERS) {
    const sid = shopId.get(o.shop);
    if (!sid) throw new Error(`e2e alerts fixture: shop ${o.shop} missing (run make seed / shops:sync)`);
    ids[o.key] = await observeAlertOffer(db, sid, o.key, o.price, new Date(Date.now() - 3600_000));
  }
  const productId = await decideManually(db, ids.a!, { kind: 'new_product' }, 'e2e-fixture');
  if (!productId) throw new Error('e2e alerts fixture: product not created');
  await decideManually(db, ids.b!, { kind: 'accept', productId }, 'e2e-fixture');
  await db.execute(sql`UPDATE products SET provisional = true WHERE id = ${productId}`);
  const today = bucharestToday();
  await rollupProducts(db, { productIds: [productId], from: addDaysIso(today, -1), to: today });
  await computeProductStats(db, [productId], today);
  await db.execute(sql`
    INSERT INTO feature_flags (key, enabled, description) VALUES ('alerts.email.enabled', true, 'Price alert emails (M19)')
    ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now()`);
  const p = await db.execute<{ slug: string }>(sql`SELECT slug FROM products WHERE id = ${productId}`);
  const totals = await db.execute<{ external_id: string; id: string; total: string }>(
    sql`SELECT external_id, id::text, total_price::text AS total FROM offers WHERE external_id LIKE ${`${ALERTS_PREFIX}%`}`,
  );
  return {
    productId,
    slug: p.rows[0]!.slug,
    offers: Object.fromEntries(totals.rows.map((r) => [r.external_id.slice(ALERTS_PREFIX.length), { offerId: Number(r.id), total: r.total }])),
    flagWas,
  };
}

/** A synthetic price change of one fixture offer (test data only), observed now, re-rolled up. */
export async function alertsFixturePrice(db: Db, key: string, lei: number): Promise<{ offerId: number; total: string }> {
  const o = await db.execute<{ shop_id: string; product_id: string }>(sql`SELECT shop_id::text, product_id::text FROM offers WHERE external_id = ${`${ALERTS_PREFIX}${key}`}`);
  const row = o.rows[0];
  if (!row) throw new Error(`e2e alerts fixture: offer ${key} missing`);
  const offerId = await observeAlertOffer(db, Number(row.shop_id), key, lei, new Date());
  const today = bucharestToday();
  await rollupProducts(db, { productIds: [Number(row.product_id)], from: today, to: today });
  await computeProductStats(db, [Number(row.product_id)], today);
  const t = await db.execute<{ total: string }>(sql`SELECT total_price::text AS total FROM offers WHERE id = ${offerId}`);
  return { offerId, total: t.rows[0]!.total };
}

/**
 * A daily-salted hash as `hashWithDailySalt` writes it (32 lowercase hex characters): a raw IP,
 * or anything else, fails the e2e assertions that read the `*_hashed` columns below.
 */
const HASH_FORMAT = '^[0-9a-f]{32}$';

/** Extra throwaway products for the alert e2e (same title, so `alerts-drop` removes them). */
export async function alertsFixtureExtraProducts(db: Db, n: number): Promise<number[]> {
  const ids: number[] = [];
  const tag = createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 8);
  for (let i = 0; i < n; i++) {
    const slug = `e2e-alerte-extra-${tag}-${i}`;
    const r = await db.execute<{ id: string }>(sql`
      INSERT INTO products (slug, title, title_ascii, provisional) VALUES (${slug}, ${E2E_ALERTS_TITLE}, ${slug}, true) RETURNING id::text`);
    ids.push(Number(r.rows[0]!.id));
  }
  return ids;
}

/** What the database holds for a test address (assertions of the e2e flows). */
export async function alertsFixtureState(db: Db, email: string): Promise<Record<string, unknown>> {
  const u = await db.execute<{ id: string; email_verified: boolean }>(sql`SELECT id, email_verified FROM users WHERE lower(email) = lower(${email})`);
  const userId = u.rows[0]?.id ?? null;
  const alerts = userId
    ? await db.execute(sql`
        SELECT id::text, status, kind, target_price::text, channel, consent_text_version,
          coalesce(consent_ip_hash ~ ${HASH_FORMAT}, false) AS consent_ip_hashed,
          confirmed_at IS NOT NULL AS confirmed, confirm_method,
          coalesce(confirm_ip_hash ~ ${HASH_FORMAT}, false) AS confirm_ip_hashed, last_notified_total::text
        FROM alerts WHERE user_id = ${userId} ORDER BY id`)
    : { rows: [] };
  const sends = userId ? await db.execute(sql`SELECT status, total::text, reason, simulated FROM alert_sends WHERE user_id = ${userId} ORDER BY id`) : { rows: [] };
  return { userId, emailVerified: u.rows[0]?.email_verified ?? null, alerts: alerts.rows, sends: sends.rows };
}

/** Consent records and suppressions of test addresses, by their hashes (users may be gone). */
export async function alertsFixtureEvidence(db: Db, emailHashes: string[]): Promise<Record<string, unknown>> {
  const h = sql.param(emailHashes);
  const consents = await db.execute(sql`
    SELECT purpose, text_version, coalesce(given_ip_hash ~ ${HASH_FORMAT}, false) AS given_ip_hashed, confirmed_at IS NOT NULL AS confirmed,
      confirm_method, withdrawn_at IS NOT NULL AS withdrawn, withdraw_method
    FROM consent_records WHERE email_hash = ANY(${h}::text[]) ORDER BY id`);
  const suppressions = await db.execute(sql`SELECT reason FROM email_suppressions WHERE email_hash = ANY(${h}::text[])`);
  return { consents: consents.rows, suppressions: suppressions.rows };
}

/** Puts a test address on the suppression list (by its hash), e.g. as a complaint would. */
export async function alertsFixtureSuppress(db: Db, emailHash: string, reason: 'complaint' | 'bounce' | 'unsubscribed'): Promise<{ suppressed: true }> {
  await db.execute(sql`
    INSERT INTO email_suppressions (email_hash, reason) VALUES (${emailHash}, ${reason})
    ON CONFLICT (email_hash) DO UPDATE SET reason = EXCLUDED.reason, created_at = now()`);
  return { suppressed: true };
}

/** Removes the alert fixture: test accounts, their evidence and suppressions, the product; restores the flag. */
export async function dropAlertsFixture(db: Db, opts: { emailHashes: string[]; restoreFlag?: boolean }): Promise<number> {
  const h = sql.param(opts.emailHashes);
  await db.execute(sql`DELETE FROM consent_records WHERE user_id IN (SELECT id FROM users WHERE email LIKE ${E2E_ALERT_EMAIL_LIKE}) OR email_hash = ANY(${h}::text[])`);
  await db.execute(sql`DELETE FROM email_suppressions WHERE email_hash = ANY(${h}::text[])`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${E2E_ALERT_EMAIL_LIKE}`);
  const like = `${ALERTS_PREFIX}%`;
  const products = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT product_id::text AS id FROM offers WHERE external_id LIKE ${like} AND product_id IS NOT NULL
    UNION SELECT id::text FROM products WHERE title = ${E2E_ALERTS_TITLE}`);
  const productIds = products.rows.map((r) => Number(r.id));
  await db.execute(sql`DELETE FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${like})`);
  await db.execute(sql`DELETE FROM offer_aliases WHERE external_id LIKE ${like}`);
  await db.execute(sql`DELETE FROM offers WHERE external_id LIKE ${like}`);
  if (productIds.length) await db.execute(sql`DELETE FROM products WHERE id = ANY(${sql.param(productIds)}::bigint[])`);
  if (opts.restoreFlag !== undefined) await db.execute(sql`UPDATE feature_flags SET enabled = ${opts.restoreFlag}, updated_at = now() WHERE key = 'alerts.email.enabled'`);
  return productIds.length;
}
