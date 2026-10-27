import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { approveMerchant, MERCHANT_FEED_PARSERS, merchants, setFlag, users } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { FEED_PARSER_FOR_FORMAT } from '@pretoscop/extractors';
import { FsBlobStore } from '@pretoscop/storage';
import { verificationValue, verifyMerchantDomain } from '../src/merchant/domain';
import { explainFetch, validateMerchantFeed } from '../src/merchant/validate';
import { runSource } from '../src/recorder/run-source';
import type { FetchLike } from '../src/recorder/types';
import { syncShops } from '../src/registry/sync';
import { createNormalize } from '../src/services';

const FIX = fileURLToPath(new URL('../../../packages/extractors/fixtures/feeds/', import.meta.url));
const GOOGLE = readFileSync(FIX + 'google_sample.rss.xml', 'utf8');

type Res = Awaited<ReturnType<FetchLike['fetchPolite']>>;
const ok = (url: string, body: string): Res => ({ status: 200, ok: true, blocked: false, body, finalUrl: url, channel: 'direct' });
let responses = new Map<string, Res>();
const requested: Array<{ url: string; purpose: string }> = [];
const fetcher: FetchLike = {
  async fetchPolite(url, opts) {
    requested.push({ url, purpose: opts.purpose });
    return responses.get(url) ?? { status: 404, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' };
  },
};

let t: TestDatabase;
let blobRoot: string;
const log = createLogger('test', { level: 'silent' });
const env = { ...getEnv({}), CRAWL_ENABLED: true };
const checkDeps = () => ({ db: t.db, fetcher, blob: new FsBlobStore(blobRoot), log });

async function merchant(values: Partial<typeof merchants.$inferInsert> = {}): Promise<number> {
  const userId = `u-${Math.random().toString(36).slice(2)}`;
  await t.db.insert(users).values({ id: userId, email: `${userId}@magazin-exemplu.ro` });
  const [row] = await t.db
    .insert(merchants)
    .values({ userId, contactEmail: `${userId}@magazin-exemplu.ro`, verificationToken: 'tok-123', domain: 'magazin-exemplu.ro', ...values })
    .returning({ id: merchants.id });
  return row!.id;
}

async function validation(id: number) {
  const [m] = await t.db.select().from(merchants).where(sql`${merchants.id} = ${id}`);
  return m!;
}

beforeAll(async () => {
  t = await createTestDatabase();
  blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-merchant-'));
  await syncShops(t.db);
  await setFlag(t.db, 'crawl.enabled', true);
}, 180_000);
afterAll(async () => {
  await t?.drop();
  rmSync(blobRoot, { recursive: true, force: true });
}, 120_000);

describe('merchant.validate', () => {
  it('keeps the portal parser map equal to the extractors one', () => {
    expect(MERCHANT_FEED_PARSERS).toEqual(FEED_PARSER_FOR_FORMAT);
  });

  it('fetches the feed as a feed, detects the format, and stores the report and a normalized preview', async () => {
    responses = new Map([['https://www.magazin-exemplu.ro/feed.xml', ok('https://www.magazin-exemplu.ro/feed.xml', GOOGLE)]]);
    const id = await merchant({ feedUrl: 'https://www.magazin-exemplu.ro/feed.xml' });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v.status).toBe('done');
    expect(requested.at(-1)).toEqual({ url: 'https://www.magazin-exemplu.ro/feed.xml', purpose: 'feed' });
    const r = v.report!;
    expect(r).toMatchObject({ source: 'url', format: 'google', detectedFormat: 'google', offers: 2, skippedRows: 0 });
    expect(r.priceFormat).toMatchObject({ verdict: 'decimal', effective: 'decimal', needsChoice: false });
    expect(r.normalization.accepted).toBe(2);
    expect(r.preview[0]).toMatchObject({ externalId: 'MX-1001', priceBani: 219999, oldPriceBani: 249999, shippingBani: 1999, totalBani: 221998, gtin: '00711719577034' });
    expect((await validation(id)).feedFormat).toBe('google');
  });

  it('asks the merchant to choose when prices like "12.500" are ambiguous', async () => {
    const csv = 'id;title;price;link\nA1;Laptop Lenovo IdeaPad 5 15ALC05;12.500;https://www.magazin-exemplu.ro/a1\n';
    responses = new Map([['https://www.magazin-exemplu.ro/f.csv', ok('https://www.magazin-exemplu.ro/f.csv', csv)]]);
    const id = await merchant({ feedUrl: 'https://www.magazin-exemplu.ro/f.csv' });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v.report!.priceFormat).toMatchObject({ verdict: 'ambiguous', needsChoice: true, ambiguousExamples: ['12.500'] });
    expect(v.report!.preview[0]!.priceBani).toBe(1_250_000);
    await t.db.update(merchants).set({ priceFormat: 'decimal' }).where(sql`${merchants.id} = ${id}`);
    const again = await validateMerchantFeed(checkDeps(), id);
    expect(again.report!.priceFormat).toMatchObject({ effective: 'decimal', needsChoice: false });
    expect(again.report!.preview[0]!.priceBani).toBe(1250);
  });

  it('turns fetch refusals into Romanian explanations', async () => {
    const url = 'https://www.magazin-exemplu.ro/feed/secret.xml';
    responses = new Map([[url, { status: 0, ok: false, blocked: false, skipped: 'robots_disallowed', body: null, finalUrl: url, channel: 'direct' }]]);
    const id = await merchant({ feedUrl: url });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v).toMatchObject({ status: 'failed' });
    expect(v.error).toMatch(/robots\.txt.*Allow: \/feed\/secret\.xml/);
    expect(explainFetch({ status: 0, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct', error: 'refused: 10.0.0.5 is not a public internet address' }, url)).toMatch(/nu este o adresă publică/);
    expect(explainFetch({ status: 403, ok: false, blocked: true, blockReason: 'http_403', body: null, finalUrl: url, channel: 'direct' }, url)).toMatch(/PretoscopBot-Feed/);
  });

  it('refuses pages that are not feeds', async () => {
    const url = 'https://www.magazin-exemplu.ro/';
    responses = new Map([[url, ok(url, '<!doctype html><html><body>Magazin</body></html>')]]);
    const v = await validateMerchantFeed(checkDeps(), await merchant({ feedUrl: url }));
    expect(v).toMatchObject({ status: 'failed', error: expect.stringMatching(/Nu am recunoscut formatul/) });
  });

  it('reads an uploaded file from the blob store', async () => {
    const blob = new FsBlobStore(blobRoot);
    await blob.put('merchant-feeds/1/feed.csv', 'id,title,price,link\nU1,Mouse Logitech M185 wireless,99.90,https://www.magazin-exemplu.ro/u1\n');
    const v = await validateMerchantFeed(checkDeps(), await merchant({ feedUploadKey: 'merchant-feeds/1/feed.csv' }));
    expect(v.report).toMatchObject({ source: 'upload', format: 'csv', offers: 1 });
  });
});

describe('merchant.verify_domain', () => {
  it('verifies through a DNS TXT record without touching the site', async () => {
    const id = await merchant();
    const before = requested.length;
    const check = await verifyMerchantDomain({ ...checkDeps(), resolveTxt: async () => [['v=spf1 -all'], ['pretoscop-verificare=', 'tok-123']] }, id);
    expect(check).toMatchObject({ status: 'done', dns: 'found' });
    expect(requested.length).toBe(before);
    expect(await validation(id)).toMatchObject({ verificationMethod: 'dns' });
    expect((await validation(id)).domainVerifiedAt).toBeInstanceOf(Date);
  });

  it('falls back to the verification file (fetched as a probe), and reports what is missing', async () => {
    const id = await merchant();
    const noDns = async () => {
      throw Object.assign(new Error('nodata'), { code: 'ENODATA' });
    };
    responses = new Map([['https://www.magazin-exemplu.ro/.well-known/pretoscop-verificare.txt', ok('x', `${verificationValue('tok-123')}\n`)]]);
    const found = await verifyMerchantDomain({ ...checkDeps(), resolveTxt: noDns }, id);
    expect(found).toMatchObject({ dns: 'missing', file: 'found' });
    expect(requested.at(-1)?.purpose).toBe('probe');
    expect(await validation(id)).toMatchObject({ verificationMethod: 'file' });

    responses = new Map();
    const other = await merchant();
    const missing = await verifyMerchantDomain({ ...checkDeps(), resolveTxt: noDns }, other);
    expect(missing).toMatchObject({ dns: 'missing', file: 'missing' });
    expect((await validation(other)).domainVerifiedAt).toBeNull();
  });
});

describe('merchant feed sources on the ingestion path', () => {
  async function approved(values: Partial<typeof merchants.$inferInsert>): Promise<number> {
    const id = await merchant({
      status: 'pending',
      shopName: 'Magazin Exemplu',
      websiteUrl: 'https://www.magazin-exemplu.ro',
      domainVerifiedAt: new Date(),
      verificationMethod: 'email',
      feedFormat: 'csv',
      ...values,
    });
    return (await approveMerchant(t.db, id, 'test')).sourceId;
  }
  const deps = () => ({ db: t.db, env, log, blob: new FsBlobStore(blobRoot), fetcher, normalize: createNormalize(() => null), alert: vi.fn(async () => undefined) });

  it('applies the declared price format and drops offers that link outside the verified domain', async () => {
    const url = 'https://www.magazin-exemplu.ro/export.csv';
    const csv = [
      'id;title;price;link',
      'K1;Cablu HDMI 2.1 Ugreen 2m negru;12.500;https://www.magazin-exemplu.ro/k1',
      'K2;Cablu HDMI 2.1 Ugreen 3m negru;19.900;https://www.alt-magazin.ro/k2',
    ].join('\n');
    responses = new Map([[url, ok(url, csv)]]);
    const sourceId = await approved({ feedUrl: url, priceFormat: 'decimal' });
    const r = await runSource(deps(), sourceId, { trigger: 'manual' });
    expect(r.status).toBe('success');
    expect(r.stats).toMatchObject({ parsed: 1, upserted: 1, offDomain: 1 });
    const offers = await t.db.execute<{ external_id: string; price: string; source_tier: number }>(sql`SELECT external_id, price::text, source_tier FROM offers WHERE source_id = ${sourceId}`);
    expect(offers.rows).toEqual([{ external_id: 'K1', price: '12.50', source_tier: 1 }]);
  });

  it('records an uploaded file at its upload time, not as a fresh check', async () => {
    const blob = new FsBlobStore(blobRoot);
    await blob.put('merchant-feeds/2/feed.csv', 'id,title,price,link\nV1,Boxa JBL Flip 6 albastra,499.00,https://www.incarcare-exemplu.ro/v1\n');
    const at = new Date(Date.now() - 2 * 3600_000);
    const sourceId = await approved({ domain: 'incarcare-exemplu.ro', websiteUrl: 'https://www.incarcare-exemplu.ro', feedUploadKey: 'merchant-feeds/2/feed.csv', feedUploadedAt: at });
    const r = await runSource(deps(), sourceId, { trigger: 'manual' });
    expect(r.status).toBe('success');
    const row = await t.db.execute<{ last_checked_at: Date }>(sql`SELECT last_checked_at FROM offers WHERE external_id = 'V1'`);
    expect(new Date(row.rows[0]!.last_checked_at).getTime()).toBe(at.getTime());
  });

  it('shops:sync leaves merchant feeds on registry shops alone', async () => {
    await t.db.execute(sql`UPDATE shops SET status = 'active', access_mode = 'feed_only' WHERE slug = 'evomag'`);
    const id = await merchant({ domain: 'evomag.ro', status: 'pending', shopName: 'evoMAG', domainVerifiedAt: new Date(), feedUrl: 'https://www.evomag.ro/feed.xml', feedFormat: 'google' });
    const { sourceKey } = await approveMerchant(t.db, id, 'test');
    const report = await syncShops(t.db);
    expect(report.changes).not.toContain(`source ${sourceKey}: disabled (removed from YAML)`);
    const src = await t.db.execute<{ enabled: boolean }>(sql`SELECT enabled FROM shop_sources WHERE key = ${sourceKey}`);
    expect(src.rows[0]!.enabled).toBe(true);
  });
});
