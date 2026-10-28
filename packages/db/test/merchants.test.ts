import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approveMerchant,
  auditLog,
  existingShopForMerchantDomain,
  feedTargetOf,
  foreignShopForHost,
  listingReportProblem,
  merchantActionsLastDay,
  merchantFeedSchedule,
  merchantSourceKey,
  merchants,
  MerchantActionError,
  reinstateMerchant,
  rejectMerchant,
  saveMerchantDomainCheck,
  saveMerchantValidation,
  sql,
  suspendMerchant,
  users,
  type MerchantFeedReport,
  type MerchantFeedTarget,
  type MerchantValidation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;

/** A finished feed check of `target` with `onDomain` listable offers on its domain. */
function checked(target: MerchantFeedTarget, over: { onDomain?: number; accepted?: number; requestedAt?: string } = {}): MerchantValidation {
  const report = {
    domain: { expected: target.domain, onDomain: over.onDomain ?? 3, offDomain: 0, offDomainExamples: [] },
    normalization: { accepted: over.accepted ?? 3, rejected: 0, rejectReasons: {}, warnings: {}, shippingBasis: {} },
    priceFormat: { verdict: 'decimal', ambiguousExamples: [], effective: 'decimal', needsChoice: false },
  } as unknown as MerchantFeedReport;
  return { status: 'done', requestedAt: over.requestedAt ?? '2026-10-28T08:00:00.000Z', finishedAt: '2026-10-28T08:00:05.000Z', target, report };
}

async function merchant(overrides: Partial<typeof merchants.$inferInsert> = {}): Promise<number> {
  const userId = `u-${Math.random().toString(36).slice(2)}`;
  await t.db.insert(users).values({ id: userId, email: `${userId}@magazin.ro`, role: 'merchant' });
  const values = {
    userId,
    status: 'pending' as const,
    shopName: 'Magazinul Meu',
    companyName: 'SC Magazinul Meu SRL',
    cui: '14399840',
    contactEmail: `${userId}@magazin.ro`,
    websiteUrl: 'https://www.magazinul-meu.ro',
    domain: 'magazinul-meu.ro',
    verificationToken: 'tok',
    verificationMethod: 'email' as const,
    domainVerifiedAt: new Date(),
    feedUrl: 'https://www.magazinul-meu.ro/feed.xml',
    feedFormat: 'google' as const,
    priceFormat: 'decimal' as const,
    shippingRules: { free_over: 200, flat: 15 },
    termsVersion: 'merchantTerms.v1@0.1',
    termsAcceptedAt: new Date(),
    submittedAt: new Date(),
    ...overrides,
  };
  const validation = 'validation' in overrides ? overrides.validation : checked(feedTargetOf(values));
  const [row] = await t.db
    .insert(merchants)
    .values({ ...values, validation })
    .returning({ id: merchants.id });
  return row!.id;
}

const row = async (q: ReturnType<typeof sql>) => (await t.db.execute<Record<string, unknown>>(q)).rows[0]!;

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.execute(sql`
    INSERT INTO shops (slug, name, domain, website_url, status, access_mode) VALUES
      ('pcgarage', 'PC Garage', 'pcgarage.ro', 'https://www.pcgarage.ro', 'blocked', 'off'),
      ('evomag', 'evoMAG', 'evomag.ro', 'https://www.evomag.ro', 'active', 'feed_only'),
      ('altex', 'Altex', 'altex.ro', 'https://altex.ro', 'active', 'direct')`);
  await t.db.execute(sql`
    INSERT INTO shop_sources (shop_id, key, kind, url, parser_key)
    SELECT id, 'evomag:listing', 'listing', 'https://www.evomag.ro/', 'evomag' FROM shops WHERE slug = 'evomag'`);
}, 180_000);

afterAll(async () => {
  await t?.drop();
}, 120_000);

describe('approveMerchant', () => {
  it('creates a feed_only shop and a six-times-a-day merchant feed source', async () => {
    const id = await merchant();
    const r = await approveMerchant(t.db, id, 'human:admin');
    expect(r).toMatchObject({ shopSlug: 'magazinul-meu', shopCreated: true, sourceKey: 'magazinul-meu:feed:merchant' });
    const shop = await row(sql`SELECT * FROM shops WHERE id = ${r.shopId}`);
    expect(shop).toMatchObject({ status: 'active', access_mode: 'feed_only', trust_tier: 2, shipping_verified: true, legal_basis_ref: `merchant:${id}` });
    expect(shop.crawl_policy).toMatchObject({ freshness_slo_hours: 12 });
    const src = await row(sql`SELECT * FROM shop_sources WHERE id = ${r.sourceId}`);
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
    expect(await row(sql`SELECT status, shop_id::int AS shop_id FROM merchants WHERE id = ${id}`)).toMatchObject({ status: 'approved', shop_id: r.shopId });
    const audit = await t.db.execute(sql`SELECT 1 FROM audit_log WHERE action = 'merchant.approve' AND entity_id = ${String(id)}`);
    expect(audit.rows).toHaveLength(1);
  });

  it('attaches to an existing open registry shop only with an explicit confirmation, and refuses a closed one', async () => {
    const open = await merchant({ domain: 'evomag.ro', websiteUrl: 'https://www.evomag.ro', feedUrl: 'https://www.evomag.ro/feed.xml' });
    const existing = await existingShopForMerchantDomain(t.db, 'evomag.ro');
    expect(existing?.shop.slug).toBe('evomag');
    expect(existing?.sources.map((s) => s.key)).toEqual(['evomag:listing']);
    await expect(approveMerchant(t.db, open, 'human:admin')).rejects.toMatchObject({ code: 'confirm_existing' });
    await expect(approveMerchant(t.db, open, 'human:admin', { confirmShopId: existing!.shop.id + 1000 })).rejects.toMatchObject({ code: 'confirm_existing' });
    const r = await approveMerchant(t.db, open, 'human:admin', { confirmShopId: existing!.shop.id });
    expect(r).toMatchObject({ shopSlug: 'evomag', shopCreated: false, sourceKey: merchantSourceKey('evomag') });

    const closed = await merchant({ domain: 'pcgarage.ro', feedUrl: 'https://www.pcgarage.ro/f.xml' });
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

  it('refuses a feed check made for another address or domain, or with no offer on the verified domain', async () => {
    const otherUrl = await merchant({
      domain: 'raport-vechi.ro',
      feedUrl: 'https://raport-vechi.ro/nou.xml',
      validation: checked({ feedUrl: 'https://raport-vechi.ro/vechi.xml', feedUploadKey: null, domain: 'raport-vechi.ro' }),
    });
    await expect(approveMerchant(t.db, otherUrl, 'a')).rejects.toMatchObject({ code: 'stale_report' });
    const otherDomain = await merchant({
      domain: 'domeniu-nou.ro',
      feedUrl: 'https://feeds.exemplu.net/f.xml',
      validation: checked({ feedUrl: 'https://feeds.exemplu.net/f.xml', feedUploadKey: null, domain: 'domeniu-vechi.ro' }),
    });
    await expect(approveMerchant(t.db, otherDomain, 'a')).rejects.toMatchObject({ code: 'stale_report' });
    const offDomainOnly = await merchant({ domain: 'in-afara.ro', feedUrl: 'https://in-afara.ro/f.xml' });
    await t.db.execute(sql`UPDATE merchants SET validation = jsonb_set(validation, '{report,domain,onDomain}', '0') WHERE id = ${offDomainOnly}`);
    await expect(approveMerchant(t.db, offDomainOnly, 'a')).rejects.toMatchObject({ code: 'stale_report' });
    const [m] = await t.db.select().from(merchants).where(sql`${merchants.id} = ${offDomainOnly}`);
    expect(listingReportProblem(m!)).toBe('off_domain_only');
    const legacy = await merchant({ domain: 'fara-tinta.ro', validation: { ...checked({ feedUrl: null, feedUploadKey: null, domain: null }), target: undefined } });
    await expect(approveMerchant(t.db, legacy, 'a')).rejects.toMatchObject({ code: 'stale_report' });
  });

  it('turns an uploaded file into an unscheduled source observed at the upload time, stale after three days', async () => {
    const at = new Date('2026-10-27T08:00:00Z');
    const id = await merchant({ domain: 'incarcat.ro', feedUrl: null, feedUploadKey: 'merchant-feeds/9/1.csv', feedUploadedAt: at, feedFormat: 'csv' });
    const r = await approveMerchant(t.db, id, 'a');
    const src = await row(sql`SELECT url, schedule, config, freshness_slo_hours FROM shop_sources WHERE id = ${r.sourceId}`);
    expect(src).toMatchObject({ url: 'upload:merchant-feeds/9/1.csv', schedule: null, freshness_slo_hours: 72 });
    expect(src.config).toMatchObject({ uploadedAt: at.toISOString() });
    expect((await row(sql`SELECT crawl_policy FROM shops WHERE id = ${r.shopId}`)).crawl_policy).toMatchObject({ freshness_slo_hours: 72 });
  });
});

describe('reject, suspend, reinstate', () => {
  async function offer(shopId: number, sourceId: number, externalId: string, productId: number | null): Promise<void> {
    await t.db.execute(sql`
      INSERT INTO offers (shop_id, source_id, external_id, url, title_raw, price, total_price, first_seen_at, last_seen_at, last_checked_at,
                          price_changed_at, content_hash, active, source_tier, product_id, match_status)
      VALUES (${shopId}, ${sourceId}, ${externalId}, ${`https://suspendat.ro/${externalId}`}, 'Produs', 100, 100, now(), now(), now(), now(), 'h', true, 1,
              ${productId}, ${productId ? 'auto' : 'unmatched'})`);
  }

  it('keeps the statement of reasons, hides the offers and pauses the shop at once, and brings the shop back on reinstatement', async () => {
    const rejected = await merchant({ domain: 'respins.ro' });
    await rejectMerchant(t.db, rejected, 'Feed-ul conține prețuri fără TVA.', 'human:admin');
    expect(await row(sql`SELECT status, status_reason FROM merchants WHERE id = ${rejected}`)).toEqual({ status: 'rejected', status_reason: 'Feed-ul conține prețuri fără TVA.' });

    const id = await merchant({ domain: 'suspendat.ro', feedUrl: 'https://suspendat.ro/f.xml' });
    const { sourceId, shopId } = await approveMerchant(t.db, id, 'a');
    const product = Number((await row(sql`INSERT INTO products (slug, title, title_ascii) VALUES ('produs-test-1', 'Produs test', 'Produs test') RETURNING id`)).id);
    await offer(shopId, sourceId, 'S1', product);
    await offer(shopId, sourceId, 'S2', null);

    const out = await suspendMerchant(t.db, id, 'Prețuri din feed diferite de cele de pe site.', 'human:admin');
    expect(out).toEqual({ shopId, productIds: [product] });
    expect(await row(sql`SELECT enabled FROM shop_sources WHERE id = ${sourceId}`)).toEqual({ enabled: false });
    expect(await row(sql`SELECT count(*)::int AS n FROM offers WHERE source_id = ${sourceId} AND active`)).toEqual({ n: 0 });
    expect(await row(sql`SELECT status FROM shops WHERE id = ${shopId}`)).toEqual({ status: 'paused' });
    await expect(suspendMerchant(t.db, id, 'again', 'a')).rejects.toMatchObject({ code: 'bad_status' });

    await reinstateMerchant(t.db, id, 'human:admin');
    expect(await row(sql`SELECT enabled FROM shop_sources WHERE id = ${sourceId}`)).toEqual({ enabled: true });
    expect(await row(sql`SELECT status FROM shops WHERE id = ${shopId}`)).toEqual({ status: 'active' });
    const actions = (await t.db.execute<{ action: string }>(sql`SELECT action FROM audit_log WHERE entity = 'merchants' AND entity_id = ${String(id)} ORDER BY id`)).rows.map((r) => r.action);
    expect(actions).toEqual(['merchant.approve', 'merchant.suspend', 'merchant.reinstate']);
  });

  it('never pauses a registry shop the feed was attached to (only the feed offers go)', async () => {
    const id = await merchant({ domain: 'altex.ro', feedUrl: 'https://altex.ro/feed.xml' });
    const altex = Number((await row(sql`SELECT id FROM shops WHERE slug = 'altex'`)).id);
    await approveMerchant(t.db, id, 'a', { confirmShopId: altex });
    await suspendMerchant(t.db, id, 'Feed-ul nu mai corespunde site-ului.', 'a');
    expect(await row(sql`SELECT status FROM shops WHERE id = ${altex}`)).toEqual({ status: 'active' });
  });

  it('blocks a second merchant for a suspended domain and maps a clash on reinstatement to a friendly error', async () => {
    const first = await merchant({ domain: 'concurent.ro', feedUrl: 'https://concurent.ro/f.xml' });
    await approveMerchant(t.db, first, 'a');
    await suspendMerchant(t.db, first, 'Prețuri greșite în mod repetat.', 'a');
    const second = await merchant({ domain: 'concurent.ro', feedUrl: 'https://concurent.ro/g.xml' });
    await expect(approveMerchant(t.db, second, 'a')).rejects.toMatchObject({ code: 'domain_suspended' });

    // Should a second listing exist anyway (approved before this rule), reinstating the first is refused cleanly.
    await t.db.execute(sql`UPDATE merchants SET status = 'approved' WHERE id = ${second}`);
    await expect(reinstateMerchant(t.db, first, 'a')).rejects.toMatchObject({ code: 'domain_taken' });
  });
});

describe('check results are bound to what was checked', () => {
  it('a domain check verifies only the domain it looked at (no race with a domain change)', async () => {
    const id = await merchant({ status: 'draft', domain: 'al-meu.ro', domainVerifiedAt: null, verificationMethod: null });
    // The merchant switched to someone else's domain while the check of its own was running.
    await t.db.execute(sql`UPDATE merchants SET domain = 'altex.ro' WHERE id = ${id}`);
    const stored = await saveMerchantDomainCheck(t.db, id, { status: 'done', requestedAt: 'x', domain: 'al-meu.ro', dns: 'found' }, 'dns');
    expect(stored).toBe(false);
    expect(await row(sql`SELECT domain, domain_verified_at, verification_method FROM merchants WHERE id = ${id}`)).toEqual({
      domain: 'altex.ro',
      domain_verified_at: null,
      verification_method: null,
    });

    await t.db.execute(sql`UPDATE merchants SET domain = 'al-meu.ro' WHERE id = ${id}`);
    expect(await saveMerchantDomainCheck(t.db, id, { status: 'done', requestedAt: 'x', domain: 'al-meu.ro', dns: 'found' }, 'dns')).toBe(true);
    expect(await row(sql`SELECT verification_method FROM merchants WHERE id = ${id}`)).toEqual({ verification_method: 'dns' });
    // A later check never changes how (or when) the domain was first verified.
    await saveMerchantDomainCheck(t.db, id, { status: 'done', requestedAt: 'y', domain: 'al-meu.ro', dns: 'missing', file: 'found' }, 'file');
    expect(await row(sql`SELECT verification_method FROM merchants WHERE id = ${id}`)).toEqual({ verification_method: 'dns' });
  });

  it('a feed check result is dropped when the address changed or a newer check was asked for', async () => {
    const target = { feedUrl: 'https://f.ro/a.xml', feedUploadKey: null, domain: 'f.ro' };
    const id = await merchant({ status: 'draft', domain: 'f.ro', feedUrl: 'https://f.ro/a.xml', validation: { status: 'queued', requestedAt: 'r1' } });
    await t.db.execute(sql`UPDATE merchants SET feed_url = 'https://f.ro/b.xml' WHERE id = ${id}`);
    expect(await saveMerchantValidation(t.db, id, { ...checked(target), requestedAt: 'r1' } as MerchantValidation & { target: MerchantFeedTarget })).toBe(false);

    await t.db.execute(sql`UPDATE merchants SET feed_url = 'https://f.ro/a.xml', validation = '{"status":"queued","requestedAt":"r2"}' WHERE id = ${id}`);
    expect(await saveMerchantValidation(t.db, id, { ...checked(target), requestedAt: 'r1' } as MerchantValidation & { target: MerchantFeedTarget })).toBe(false);
    expect(await saveMerchantValidation(t.db, id, { ...checked(target), requestedAt: 'r2' } as MerchantValidation & { target: MerchantFeedTarget }, 'google')).toBe(true);
    const [m] = await t.db.select().from(merchants).where(sql`${merchants.id} = ${id}`);
    expect(m!.validation?.status).toBe('done');
    expect(listingReportProblem(m!)).toBeNull();
  });
});

describe('portal limits and foreign hosts', () => {
  it('counts merchant actions of the last 24 hours only', async () => {
    const id = await merchant({ status: 'draft', domain: 'limita.ro' });
    const actor = 'merchant:u-limita';
    await t.db.insert(auditLog).values([
      { actor, action: 'merchant.feed_url', entity: 'merchants', entityId: String(id) },
      { actor, action: 'merchant.feed_recheck', entity: 'merchants', entityId: String(id) },
      { actor, action: 'merchant.feed_url', entity: 'merchants', entityId: String(id), ts: new Date(Date.now() - 25 * 3600_000) },
      { actor: 'human:admin', action: 'merchant.feed_url', entity: 'merchants', entityId: String(id) },
    ]);
    expect(await merchantActionsLastDay(t.db, id, ['merchant.feed_url', 'merchant.feed_recheck'])).toBe(2);
  });

  it("finds registered shops other than the merchant's own behind a host", async () => {
    const own = { merchantId: 999_999, domain: 'magazin-nou.ro', domainVerified: true };
    expect(await foreignShopForHost(t.db, 'www.altex.ro', own)).toMatchObject({ slug: 'altex' });
    expect(await foreignShopForHost(t.db, 'altex.ro', own)).toMatchObject({ slug: 'altex' });
    expect(await foreignShopForHost(t.db, 'maltex.ro', own)).toBeNull();
    expect(await foreignShopForHost(t.db, 'feeds.magazin-nou.ro', own)).toBeNull();
    // Claimed but not verified: a registered shop's host stays off limits.
    expect(await foreignShopForHost(t.db, 'www.altex.ro', { merchantId: 999_999, domain: 'altex.ro', domainVerified: false })).toMatchObject({ slug: 'altex' });
    expect(await foreignShopForHost(t.db, 'www.altex.ro', { merchantId: 999_999, domain: 'altex.ro', domainVerified: true })).toBeNull();
  });
});
