import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approveMerchant,
  merchantFeedSchedule,
  merchantSourceKey,
  merchants,
  MerchantActionError,
  reinstateMerchant,
  rejectMerchant,
  sql,
  suspendMerchant,
  users,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;

async function merchant(overrides: Partial<typeof merchants.$inferInsert> = {}): Promise<number> {
  const userId = `u-${Math.random().toString(36).slice(2)}`;
  await t.db.insert(users).values({ id: userId, email: `${userId}@magazin.ro`, role: 'merchant' });
  const [row] = await t.db
    .insert(merchants)
    .values({
      userId,
      status: 'pending',
      shopName: 'Magazinul Meu',
      companyName: 'SC Magazinul Meu SRL',
      cui: '14399840',
      contactEmail: `${userId}@magazin.ro`,
      websiteUrl: 'https://www.magazinul-meu.ro',
      domain: 'magazinul-meu.ro',
      verificationToken: 'tok',
      verificationMethod: 'email',
      domainVerifiedAt: new Date(),
      feedUrl: 'https://www.magazinul-meu.ro/feed.xml',
      feedFormat: 'google',
      priceFormat: 'decimal',
      shippingRules: { free_over: 200, flat: 15 },
      termsVersion: 'merchantTerms.v1@0.1',
      termsAcceptedAt: new Date(),
      submittedAt: new Date(),
      ...overrides,
    })
    .returning({ id: merchants.id });
  return row!.id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.execute(sql`
    INSERT INTO shops (slug, name, domain, website_url, status, access_mode) VALUES
      ('pcgarage', 'PC Garage', 'pcgarage.ro', 'https://www.pcgarage.ro', 'blocked', 'off'),
      ('evomag', 'evoMAG', 'evomag.ro', 'https://www.evomag.ro', 'active', 'feed_only')`);
}, 60_000);

afterAll(async () => {
  await t?.drop();
});

describe('approveMerchant', () => {
  it('creates a feed_only shop and a six-times-a-day merchant feed source', async () => {
    const id = await merchant();
    const r = await approveMerchant(t.db, id, 'human:admin');
    expect(r).toMatchObject({ shopSlug: 'magazinul-meu', shopCreated: true, sourceKey: 'magazinul-meu:feed:merchant' });
    const shop = (await t.db.execute<Record<string, unknown>>(sql`SELECT * FROM shops WHERE id = ${r.shopId}`)).rows[0]!;
    expect(shop).toMatchObject({ status: 'active', access_mode: 'feed_only', trust_tier: 2, shipping_verified: true, legal_basis_ref: `merchant:${id}` });
    const src = (await t.db.execute<Record<string, unknown>>(sql`SELECT * FROM shop_sources WHERE id = ${r.sourceId}`)).rows[0]!;
    expect(src).toMatchObject({
      kind: 'feed',
      url: 'https://www.magazinul-meu.ro/feed.xml',
      parser_key: 'feed-google-shopping',
      schedule: merchantFeedSchedule(id),
      enabled: true,
      kill_switch: false,
      source_tier: 1,
      freshness_slo_hours: 12,
    });
    expect(src.config).toMatchObject({ origin: 'merchant', merchantId: id, priceFormat: 'decimal', requireDomain: 'magazinul-meu.ro' });
    const m = (await t.db.execute<Record<string, unknown>>(sql`SELECT status, shop_id::int AS shop_id FROM merchants WHERE id = ${id}`)).rows[0]!;
    expect(m).toMatchObject({ status: 'approved', shop_id: r.shopId });
    const audit = await t.db.execute(sql`SELECT 1 FROM audit_log WHERE action = 'merchant.approve' AND entity_id = ${String(id)}`);
    expect(audit.rows).toHaveLength(1);
  });

  it('attaches to an existing open registry shop, and refuses a closed one', async () => {
    const open = await merchant({ domain: 'evomag.ro', websiteUrl: 'https://www.evomag.ro' });
    const r = await approveMerchant(t.db, open, 'human:admin');
    expect(r).toMatchObject({ shopSlug: 'evomag', shopCreated: false, sourceKey: merchantSourceKey('evomag') });

    const closed = await merchant({ domain: 'pcgarage.ro' });
    await expect(approveMerchant(t.db, closed, 'human:admin')).rejects.toMatchObject({ code: 'shop_closed' });
  });

  it('refuses unverified domains, missing feeds, wrong states and a second listing of the same domain', async () => {
    const unverified = await merchant({ domain: 'altul.ro', domainVerifiedAt: null });
    await expect(approveMerchant(t.db, unverified, 'a')).rejects.toMatchObject({ code: 'domain_unverified' });
    const noFeed = await merchant({ domain: 'fara-feed.ro', feedUrl: null, feedUploadKey: null });
    await expect(approveMerchant(t.db, noFeed, 'a')).rejects.toMatchObject({ code: 'no_feed' });
    const draft = await merchant({ domain: 'ciorna.ro', status: 'draft' });
    await expect(approveMerchant(t.db, draft, 'a')).rejects.toMatchObject({ code: 'bad_status' });
    const second = await merchant({ domain: 'magazinul-meu.ro' });
    await expect(approveMerchant(t.db, second, 'a')).rejects.toBeInstanceOf(MerchantActionError);
  });

  it('turns an uploaded file into an unscheduled source observed at the upload time', async () => {
    const at = new Date('2026-10-27T08:00:00Z');
    const id = await merchant({ domain: 'incarcat.ro', feedUrl: null, feedUploadKey: 'merchant-feeds/9/1.csv', feedUploadedAt: at, feedFormat: 'csv' });
    const r = await approveMerchant(t.db, id, 'a');
    const src = (await t.db.execute<Record<string, unknown>>(sql`SELECT url, schedule, config, freshness_slo_hours FROM shop_sources WHERE id = ${r.sourceId}`)).rows[0]!;
    expect(src).toMatchObject({ url: 'upload:merchant-feeds/9/1.csv', schedule: null, freshness_slo_hours: 72 });
    expect(src.config).toMatchObject({ uploadedAt: at.toISOString() });
  });
});

describe('reject, suspend, reinstate', () => {
  it('keeps the statement of reasons and switches the feed source off and on', async () => {
    const rejected = await merchant({ domain: 'respins.ro' });
    await rejectMerchant(t.db, rejected, 'Feed-ul conține prețuri fără TVA.', 'human:admin');
    const r1 = (await t.db.execute<Record<string, unknown>>(sql`SELECT status, status_reason FROM merchants WHERE id = ${rejected}`)).rows[0]!;
    expect(r1).toEqual({ status: 'rejected', status_reason: 'Feed-ul conține prețuri fără TVA.' });

    const id = await merchant({ domain: 'suspendat.ro' });
    const { sourceId } = await approveMerchant(t.db, id, 'a');
    await suspendMerchant(t.db, id, 'Prețuri din feed diferite de cele de pe site.', 'human:admin');
    const off = (await t.db.execute<{ enabled: boolean }>(sql`SELECT enabled FROM shop_sources WHERE id = ${sourceId}`)).rows[0]!;
    expect(off.enabled).toBe(false);
    await expect(suspendMerchant(t.db, id, 'again', 'a')).rejects.toMatchObject({ code: 'bad_status' });
    await reinstateMerchant(t.db, id, 'human:admin');
    const on = (await t.db.execute<{ enabled: boolean }>(sql`SELECT enabled FROM shop_sources WHERE id = ${sourceId}`)).rows[0]!;
    expect(on.enabled).toBe(true);
    const actions = (await t.db.execute<{ action: string }>(sql`SELECT action FROM audit_log WHERE entity = 'merchants' AND entity_id = ${String(id)} ORDER BY id`)).rows.map((r) => r.action);
    expect(actions).toEqual(['merchant.approve', 'merchant.suspend', 'merchant.reinstate']);
  });
});
