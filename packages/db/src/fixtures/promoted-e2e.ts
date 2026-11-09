import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { decideManually } from '../queries/matching';
import { recordObservation } from '../queries/offers';
import { addDaysIso, bucharestToday, computeProductStats, rollupProducts } from '../queries/rollup';

/**
 * Promoted placements e2e (M25): an approved merchant with its own shop, a throwaway product in a
 * real category with three live offers (the merchant's is not the cheapest), and the flag
 * `promoted.enabled` on for the run. The merchant's account is `promovare-e2e-<run>@pretoscop.test`
 * (a new address per run: magic links are capped per address and hour). Offers carry the shared
 * `e2e-fixture-` prefix and the product the "(produs de test E2E)" mark, so the M13 fixture's drop
 * removes leftovers too; the merchant, its shop and its money rows are removed by
 * `dropPromotedFixture` only.
 */
export const E2E_PROMOTED_EMAIL_LIKE = 'promovare-e2e-%@pretoscop.test';
export const E2E_PROMOTED_TITLE = 'Telefon mobil Promovoscop P1, 128GB, 8GB RAM, Verde (produs de test E2E)';
const PREFIX = 'e2e-fixture-promovare-';
const SHOP = { slug: 'e2e-promovare-magazin', name: 'Magazin Promovat E2E', domain: 'e2e-promovare.test' } as const;
const OFFERS = [
  { key: 'promo', shop: SHOP.slug, price: 2499, shipping: 0 },
  { key: 'itgalaxy', shop: 'itgalaxy', price: 2349, shipping: 0 },
  { key: 'forit', shop: 'forit', price: 2399, shipping: 20 },
] as const;

export interface E2ePromotedFixture {
  email: string;
  userId: string;
  merchantId: number;
  shopId: number;
  shopName: string;
  shopDomain: string;
  productId: number;
  slug: string;
  categoryId: number;
  categoryPath: string;
  offers: Record<(typeof OFFERS)[number]['key'], { offerId: number; totalBani: number }>;
  /** `promoted.enabled` and `ads.slots.enabled` before the run (restored by the drop). */
  flagsWere: Record<string, boolean>;
}

const FLAGS = ['promoted.enabled', 'ads.slots.enabled'] as const;

export async function createPromotedFixture(db: Db, email: string): Promise<E2ePromotedFixture> {
  if (!/^promovare-e2e-[a-z0-9-]+@pretoscop\.test$/.test(email)) throw new Error('promoted fixture: the address must match promovare-e2e-…@pretoscop.test');
  await dropPromotedFixture(db, {});
  const flags = await db.execute<{ key: string; enabled: boolean }>(sql`SELECT key, enabled FROM feature_flags WHERE key IN ('promoted.enabled', 'ads.slots.enabled')`);
  const flagsWere = Object.fromEntries(FLAGS.map((k) => [k, flags.rows.find((r) => r.key === k)?.enabled ?? false]));
  // A leaf category of the seeded taxonomy (phones), else any leaf.
  const cat = await db.execute<{ id: string; path: string }>(sql`
    SELECT c.id::text, c.path FROM categories c WHERE NOT EXISTS (SELECT 1 FROM categories x WHERE x.parent_id = c.id)
    ORDER BY (c.slug = 'telefoane-mobile') DESC, c.id LIMIT 1`);
  const category = cat.rows[0];
  if (!category) throw new Error('promoted fixture: no category (run make seed)');

  const shop = await db.execute<{ id: string }>(sql`
    INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier, legal_basis_ref)
    VALUES (${SHOP.slug}, ${SHOP.name}, ${SHOP.domain}, ${`https://www.${SHOP.domain}`}, 'retail', 'active', 'feed_only', 2, 'e2e fixture (M25)')
    RETURNING id::text`);
  const shopId = Number(shop.rows[0]!.id);
  const userId = `e2e-promovare-${createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
  await db.execute(sql`INSERT INTO users (id, email, email_verified, role) VALUES (${userId}, ${email}, true, 'merchant')`);
  const merchant = await db.execute<{ id: string }>(sql`
    INSERT INTO merchants (user_id, shop_id, status, shop_name, company_name, cui, contact_email, website_url, domain, verification_token, verification_method,
      domain_verified_at, terms_version, terms_accepted_at, decided_at, decided_by, submitted_at)
    VALUES (${userId}, ${shopId}, 'approved', ${SHOP.name}, 'SC Magazin Promovat E2E SRL', '18547290', ${email}, ${`https://www.${SHOP.domain}`}, ${SHOP.domain}, 'e2e',
      'admin', now(), 'merchantTerms.v1@0.3', now(), now(), 'e2e-fixture', now())
    RETURNING id::text`);
  const merchantId = Number(merchant.rows[0]!.id);

  const shops = await db.execute<{ slug: string; id: string; domain: string }>(sql`SELECT slug, id::text, domain FROM shops WHERE slug IN ('itgalaxy', 'forit', ${SHOP.slug})`);
  const shopIds = new Map(shops.rows.map((r) => [r.slug, { id: Number(r.id), domain: r.domain }]));
  const now = Date.now();
  const ids: Record<string, number> = {};
  for (const o of OFFERS) {
    const s = shopIds.get(o.shop);
    if (!s) throw new Error(`promoted fixture: shop ${o.shop} missing (run make seed)`);
    const totalBani = Math.round((o.price + o.shipping) * 100);
    // Three daily observations (a short history), the last one hour ago: fresh for every shop's SLO.
    for (const daysAgo of [2, 1, 0]) {
      const r = await recordObservation(db, {
        shopId: s.id,
        sourceId: null,
        sourceTier: 1,
        runId: null,
        externalId: `${PREFIX}${o.key}`,
        url: `https://www.${s.domain}/e2e-fixture/promovare-${o.key}`,
        titleRaw: E2E_PROMOTED_TITLE,
        titleClean: E2E_PROMOTED_TITLE,
        attributes: { kind: 'phone', storageGb: 128, ramGb: 8, color: 'green', colorRo: 'verde' },
        priceBani: Math.round(o.price * 100),
        shippingBani: Math.round(o.shipping * 100),
        shippingEstimated: false,
        totalBani,
        availability: 'in_stock',
        condition: 'new',
        sellerType: 'shop',
        contentHash: createHash('sha256').update(`${o.key}|${o.price}|${o.shipping}`).digest('hex'),
        observedAt: new Date(daysAgo === 0 ? now - 3600_000 : now - daysAgo * 86_400_000),
      });
      if (r.offerId) ids[o.key] = r.offerId;
    }
  }
  const productId = await decideManually(db, ids.promo!, { kind: 'new_product' }, 'e2e-fixture');
  if (!productId) throw new Error('promoted fixture: product not created');
  for (const o of OFFERS) if (o.key !== 'promo') await decideManually(db, ids[o.key]!, { kind: 'accept', productId }, 'e2e-fixture');
  await db.execute(sql`UPDATE products SET category_id = ${Number(category.id)} WHERE id = ${productId}`);
  const today = bucharestToday();
  await rollupProducts(db, { productIds: [productId], from: addDaysIso(today, -3), to: today });
  await computeProductStats(db, [productId], today);
  // Never indexed (a test product), like every e2e fixture product.
  await db.execute(sql`UPDATE products SET provisional = true WHERE id = ${productId}`);
  await db.execute(sql`INSERT INTO feature_flags (key, enabled) VALUES ('promoted.enabled', true) ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now()`);

  const p = await db.execute<{ slug: string }>(sql`SELECT slug FROM products WHERE id = ${productId}`);
  const offers = await db.execute<{ external_id: string; id: string; total: string }>(sql`
    SELECT external_id, id::text, total_price::text AS total FROM offers WHERE external_id LIKE ${`${PREFIX}%`}`);
  return {
    email,
    userId,
    merchantId,
    shopId,
    shopName: SHOP.name,
    shopDomain: SHOP.domain,
    productId,
    slug: p.rows[0]!.slug,
    categoryId: Number(category.id),
    categoryPath: category.path,
    offers: Object.fromEntries(
      offers.rows.map((r) => [r.external_id.slice(PREFIX.length), { offerId: Number(r.id), totalBani: Math.round(Number(r.total) * 100) }]),
    ) as E2ePromotedFixture['offers'],
    flagsWere,
  };
}

export interface PromotedFixtureState {
  balanceBani: number | null;
  billed: number;
  billedBani: number;
  notBilled: Record<string, number>;
  ledger: Array<{ kind: string; amountBani: number }>;
  topups: Array<{ status: string; netBani: number; grossBani: number; externalId: string | null }>;
  /** Click-outs of the merchant's promoted offer: placement and whether an affiliate link was used. */
  clicks: Array<{ placement: string | null; isAffiliate: boolean }>;
}

/** Money and click rows of the fixture merchant (the e2e checks them after each step). */
export async function promotedFixtureState(db: Db, merchantId: number): Promise<PromotedFixtureState> {
  const [w, pc, ledger, topups, clicks] = await Promise.all([
    db.execute<{ balance: string }>(sql`SELECT balance::text FROM merchant_wallets WHERE merchant_id = ${merchantId}`),
    db.execute<{ status: string; reason: string | null; n: number; amount: string }>(sql`
      SELECT status, reason, count(*)::int AS n, coalesce(sum(price), 0)::text AS amount FROM promoted_clicks WHERE merchant_id = ${merchantId} GROUP BY status, reason`),
    db.execute<{ kind: string; amount: string }>(sql`SELECT kind, amount::text FROM wallet_ledger WHERE merchant_id = ${merchantId} ORDER BY id`),
    db.execute<{ status: string; net: string; gross: string; external_id: string | null }>(sql`
      SELECT status, net::text, gross::text, external_id FROM wallet_topups WHERE merchant_id = ${merchantId} ORDER BY id`),
    db.execute<{ placement: string | null; is_affiliate: boolean }>(sql`
      SELECT k.placement, k.is_affiliate FROM clicks k JOIN offers o ON o.id = k.offer_id
      WHERE o.external_id = ${`${PREFIX}promo`} ORDER BY k.id`),
  ]);
  const bani = (v: string) => Math.round(Number(v) * 100);
  const billedRow = pc.rows.find((r) => r.status === 'billed');
  return {
    balanceBani: w.rows[0] ? bani(w.rows[0].balance) : null,
    billed: billedRow?.n ?? 0,
    billedBani: billedRow ? bani(billedRow.amount) : 0,
    notBilled: Object.fromEntries(pc.rows.filter((r) => r.status === 'not_billed').map((r) => [r.reason ?? '?', r.n])),
    ledger: ledger.rows.map((l) => ({ kind: l.kind, amountBani: bani(l.amount) })),
    topups: topups.rows.map((t) => ({ status: t.status, netBani: bani(t.net), grossBani: bani(t.gross), externalId: t.external_id })),
    clicks: clicks.rows.map((c) => ({ placement: c.placement, isAffiliate: c.is_affiliate })),
  };
}

/** Sets one of the fixture's flags for a step of the run (only these two). */
export async function setPromotedFlag(db: Db, key: string, enabled: boolean): Promise<void> {
  if (!(FLAGS as readonly string[]).includes(key)) throw new Error(`not a promoted fixture flag: ${key}`);
  await db.execute(sql`INSERT INTO feature_flags (key, enabled) VALUES (${key}, ${enabled}) ON CONFLICT (key) DO UPDATE SET enabled = ${enabled}, updated_at = now()`);
}

/** Removes the fixture merchant, its shop, money rows, product and offers; restores the flags given. */
export async function dropPromotedFixture(db: Db, opts: { restoreFlags?: Record<string, boolean> }): Promise<number> {
  const m = await db.execute<{ id: string }>(sql`
    SELECT m.id::text FROM merchants m JOIN users u ON u.id = m.user_id WHERE u.email LIKE ${E2E_PROMOTED_EMAIL_LIKE}
    UNION SELECT m.id::text FROM merchants m JOIN shops s ON s.id = m.shop_id WHERE s.slug = ${SHOP.slug}`);
  const merchantIds = m.rows.map((r) => Number(r.id));
  if (merchantIds.length) {
    const ids = sql.param(merchantIds);
    for (const table of ['promoted_clicks', 'wallet_ledger', 'wallet_topups', 'merchant_wallets', 'placements'] as const) {
      await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE merchant_id = ANY(${ids}::bigint[])`);
    }
    await db.execute(sql`DELETE FROM merchants WHERE id = ANY(${ids}::bigint[])`);
  }
  const products = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT product_id::text AS id FROM offers WHERE external_id LIKE ${`${PREFIX}%`} AND product_id IS NOT NULL
    UNION SELECT id::text FROM products WHERE title = ${E2E_PROMOTED_TITLE}`);
  await db.execute(sql`DELETE FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${`${PREFIX}%`})`);
  await db.execute(sql`DELETE FROM offer_aliases WHERE external_id LIKE ${`${PREFIX}%`}`);
  await db.execute(sql`DELETE FROM offers WHERE external_id LIKE ${`${PREFIX}%`}`);
  const productIds = products.rows.map((r) => Number(r.id));
  if (productIds.length) {
    const ids = sql.param(productIds);
    await db.execute(sql`DELETE FROM product_merges WHERE from_product_id = ANY(${ids}::bigint[]) OR into_product_id = ANY(${ids}::bigint[])`);
    await db.execute(sql`DELETE FROM products WHERE id = ANY(${ids}::bigint[])`);
  }
  await db.execute(sql`DELETE FROM shops WHERE slug = ${SHOP.slug}`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${E2E_PROMOTED_EMAIL_LIKE}`);
  for (const [key, enabled] of Object.entries(opts.restoreFlags ?? {})) if ((FLAGS as readonly string[]).includes(key)) await setPromotedFlag(db, key, enabled);
  return merchantIds.length + productIds.length;
}
