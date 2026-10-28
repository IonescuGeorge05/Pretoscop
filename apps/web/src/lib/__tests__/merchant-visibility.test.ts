import { getEnv } from '@pretoscop/config/env';
import { approveMerchant, feedTargetOf, merchants, reinstateMerchant, sql, suspendMerchant, users, type MerchantFeedReport } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The product page loader, without Next's cache and against a throwaway database.
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));
let t: TestDatabase;
vi.mock('../db', () => ({ db: () => t.db, serverEnv: () => getEnv({} as NodeJS.ProcessEnv) }));

const { getProductPageData } = await import('../product');

let merchantId: number;
let productId: number;
let sourceId: number;

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.insert(users).values({ id: 'u-vizibil', email: 'ion@vizibil.ro', role: 'merchant' });
  const target = feedTargetOf({ feedUrl: 'https://vizibil.ro/feed.xml', domain: 'vizibil.ro' });
  const report = {
    domain: { expected: 'vizibil.ro', onDomain: 1, offDomain: 0, offDomainExamples: [] },
    normalization: { accepted: 1, rejected: 0, rejectReasons: {}, warnings: {}, shippingBasis: {} },
    priceFormat: { verdict: 'decimal', ambiguousExamples: [], effective: 'decimal', needsChoice: false },
  } as unknown as MerchantFeedReport;
  const [m] = await t.db
    .insert(merchants)
    .values({
      userId: 'u-vizibil',
      status: 'pending',
      shopName: 'Magazin Vizibil',
      contactEmail: 'ion@vizibil.ro',
      domain: 'vizibil.ro',
      websiteUrl: 'https://vizibil.ro',
      verificationToken: 'tok',
      verificationMethod: 'email',
      domainVerifiedAt: new Date(),
      feedUrl: 'https://vizibil.ro/feed.xml',
      feedFormat: 'google',
      validation: { status: 'done', requestedAt: 'r1', target, report },
    })
    .returning({ id: merchants.id });
  merchantId = m!.id;
  const approved = await approveMerchant(t.db, merchantId, 'test');
  sourceId = approved.sourceId;
  const p = await t.pool.query<{ id: string }>(`INSERT INTO products (slug, title, title_ascii) VALUES ('casti-test', 'Căști test', 'Casti test') RETURNING id`);
  productId = Number(p.rows[0]!.id);
  await t.pool.query(`UPDATE products SET slug = 'casti-test-' || id WHERE id = $1`, [productId]);
  await t.pool.query(
    `INSERT INTO offers (shop_id, source_id, external_id, url, title_raw, price, total_price, first_seen_at, last_seen_at, last_checked_at,
                         price_changed_at, content_hash, active, source_tier, product_id, match_status, availability)
     VALUES ($1, $2, 'V1', 'https://vizibil.ro/casti', 'Căști test', 199.90, 199.90, now(), now(), now(), now(), 'h', true, 1, $3, 'auto', 'in_stock')`,
    [approved.shopId, sourceId, productId],
  );
});

afterAll(async () => {
  await t?.drop();
});

const shopsOnPage = async () => (await getProductPageData(productId))!.offers.map((o) => o.shopName);

describe('a suspended merchant disappears from product pages at once', () => {
  it('shows the approved merchant, hides it on suspension, and brings the shop back on reinstatement (offers return with the next read)', async () => {
    expect(await shopsOnPage()).toEqual(['Magazin Vizibil']);

    const out = await suspendMerchant(t.db, merchantId, 'Prețuri din feed diferite de cele de pe site.', 'human:admin');
    expect(out.productIds).toEqual([productId]);
    expect(await shopsOnPage()).toEqual([]);

    await reinstateMerchant(t.db, merchantId, 'human:admin');
    // The shop is active again, but its offers wait for the feed read the reinstatement queues.
    expect(await shopsOnPage()).toEqual([]);
    const shop = await t.db.execute<{ status: string }>(sql`SELECT status FROM shops WHERE legal_basis_ref = ${`merchant:${merchantId}`}`);
    expect(shop.rows[0]!.status).toBe('active');
  });
});
