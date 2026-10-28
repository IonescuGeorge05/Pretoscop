import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import {
  approveMerchant,
  feedTargetOf,
  listingReportProblem,
  MERCHANT_FEED_PARSERS,
  merchants,
  setFlag,
  users,
  type MerchantFeedReport,
  type MerchantValidation,
} from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { FEED_PARSER_FOR_FORMAT } from '@pretoscop/extractors';
import { createGuardedDispatcher } from '@pretoscop/fetch';
import { FsBlobStore } from '@pretoscop/storage';
import { PgDomainStateStore } from '../src/fetch/pg-state';
import { verificationValue, verifyMerchantDomain } from '../src/merchant/domain';
import { explainFetch, validateMerchantFeed } from '../src/merchant/validate';
import { runSource } from '../src/recorder/run-source';
import type { FetchLike } from '../src/recorder/types';
import { syncShops } from '../src/registry/sync';
import { createMerchantFetcher, createNormalize } from '../src/services';

const FIX = fileURLToPath(new URL('../../../packages/extractors/fixtures/feeds/', import.meta.url));
const GOOGLE = readFileSync(FIX + 'google_sample.rss.xml', 'utf8');

type Res = Awaited<ReturnType<FetchLike['fetchPolite']>>;
const ok = (url: string, body: string): Res => ({ status: 200, ok: true, blocked: false, body, finalUrl: url, channel: 'direct' });
let responses = new Map<string, Res>();
const requested: Array<{ url: string; purpose: string }> = [];
/** Stands in for the merchant-scoped fetcher. */
const fetcher: FetchLike = {
  async fetchPolite(url, opts) {
    requested.push({ url, purpose: opts.purpose });
    const hook = onFetch.get(url);
    if (hook) await hook();
    return responses.get(url) ?? { status: 404, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' };
  },
};
const onFetch = new Map<string, () => Promise<void>>();
/** The crawler's fetcher: merchant work must never reach it. */
const crawlerFetcher: FetchLike = {
  async fetchPolite(url) {
    throw new Error(`the crawler fetcher was used for ${url}`);
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

async function load(id: number) {
  const [m] = await t.db.select().from(merchants).where(sql`${merchants.id} = ${id}`);
  return m!;
}

/** A finished check of the merchant's current feed (what approval requires). */
function passed(values: { feedUrl?: string | null; feedUploadKey?: string | null; domain?: string | null }): MerchantValidation {
  const target = feedTargetOf({ feedUrl: values.feedUrl ?? null, feedUploadKey: values.feedUploadKey ?? null, domain: values.domain ?? 'magazin-exemplu.ro' });
  const report = {
    domain: { expected: target.domain, onDomain: 1, offDomain: 0, offDomainExamples: [] },
    normalization: { accepted: 1, rejected: 0, rejectReasons: {}, warnings: {}, shippingBasis: {} },
    priceFormat: { verdict: 'decimal', ambiguousExamples: [], effective: 'decimal', needsChoice: false },
  } as unknown as MerchantFeedReport;
  return { status: 'done', requestedAt: '2026-10-28T08:00:00.000Z', target, report };
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

describe('merchant.feed_check', () => {
  it('keeps the portal parser map equal to the extractors one', () => {
    expect(MERCHANT_FEED_PARSERS).toEqual(FEED_PARSER_FOR_FORMAT);
  });

  it('fetches the feed as a feed, detects the format, and stores the report, stamped with what was checked', async () => {
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
    const m = await load(id);
    expect(m.feedFormat).toBe('google');
    expect(m.validation?.target).toEqual({ feedUrl: 'https://www.magazin-exemplu.ro/feed.xml', feedUploadKey: null, domain: 'magazin-exemplu.ro' });
    expect(listingReportProblem(m)).toBeNull();
  });

  it('asks the merchant to choose when prices like "12.500" are ambiguous', async () => {
    const csv = 'id;title;price;link\nA1;Laptop Lenovo IdeaPad 5 15ALC05;12.500;https://www.magazin-exemplu.ro/a1\n';
    responses = new Map([['https://www.magazin-exemplu.ro/f.csv', ok('https://www.magazin-exemplu.ro/f.csv', csv)]]);
    const id = await merchant({ feedUrl: 'https://www.magazin-exemplu.ro/f.csv' });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v.report!.priceFormat).toMatchObject({ verdict: 'ambiguous', needsChoice: true, ambiguousExamples: ['12.500'] });
    expect(v.report!.preview[0]!.priceBani).toBe(1_250_000);
    expect(listingReportProblem(await load(id))).toBe('price_format');
    await t.db.update(merchants).set({ priceFormat: 'decimal' }).where(sql`${merchants.id} = ${id}`);
    const again = await validateMerchantFeed(checkDeps(), id);
    expect(again.report!.priceFormat).toMatchObject({ effective: 'decimal', needsChoice: false });
    expect(again.report!.preview[0]!.priceBani).toBe(1250);
  });

  it('counts offers that link outside the shop domain as not listable, so a feed of only such offers cannot be submitted', async () => {
    const csv = ['id,title,price,link', 'O1,Mouse Logitech M185,99.90,https://www.alt-magazin.ro/o1', 'O2,Mouse Logitech M190,109.90,https://alt-magazin.ro/o2'].join('\n');
    responses = new Map([['https://feeds.exemplu.net/o.csv', ok('https://feeds.exemplu.net/o.csv', csv)]]);
    const id = await merchant({ feedUrl: 'https://feeds.exemplu.net/o.csv' });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v.status).toBe('done');
    expect(v.report!.normalization).toMatchObject({ accepted: 0, rejected: 2, rejectReasons: { off_domain: 2 } });
    expect(v.report!.preview.map((p) => p.rejects)).toEqual([['off_domain'], ['off_domain']]);
    expect(listingReportProblem(await load(id))).toBe('off_domain_only');
  });

  it('turns fetch refusals into Romanian explanations', async () => {
    const url = 'https://www.magazin-exemplu.ro/feed/secret.xml';
    responses = new Map([[url, { status: 0, ok: false, blocked: false, skipped: 'robots_disallowed', body: null, finalUrl: url, channel: 'direct' }]]);
    const id = await merchant({ feedUrl: url });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v).toMatchObject({ status: 'failed' });
    expect(v.error).toMatch(/robots\.txt.*Allow: \/feed\/secret\.xml/);
    const base = { status: 0, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' as const };
    expect(explainFetch({ ...base, error: 'refused: 10.0.0.5 is not a public internet address' }, url)).toMatch(/nu este o adresă publică/);
    // The guard refuses robots.txt first: the explanation must still name the address, not robots.txt.
    expect(
      explainFetch({ ...base, skipped: 'robots_disallowed', errorCode: 'robots_unavailable', error: 'robots.txt unreachable (refused: 127.0.0.1 is not a public internet address): complete disallow (RFC 9309)' }, url),
    ).toMatch(/nu este o adresă publică/);
    expect(explainFetch({ ...base, skipped: 'robots_disallowed', errorCode: 'robots_unavailable', error: 'robots.txt unreachable (HTTP 500)' }, url)).toMatch(/Nu am putut citi fișierul robots\.txt/);
    expect(explainFetch({ ...base, status: 403, blocked: true, blockReason: 'http_403' }, url)).toMatch(/PretoscopBot-Feed/);
  });

  it('refuses pages that are not feeds', async () => {
    const url = 'https://www.magazin-exemplu.ro/';
    responses = new Map([[url, ok(url, '<!doctype html><html><body>Magazin</body></html>')]]);
    const v = await validateMerchantFeed(checkDeps(), await merchant({ feedUrl: url }));
    expect(v).toMatchObject({ status: 'failed', error: expect.stringMatching(/Nu am recunoscut formatul/) });
  });

  it('never sends our bot to the host of a shop we crawl on behalf of a merchant who has not proven it is theirs', async () => {
    const before = requested.length;
    const id = await merchant({ feedUrl: 'https://www.evomag.ro/?q=<script>' });
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v).toMatchObject({ status: 'failed', error: expect.stringMatching(/evomag\.ro, al unui magazin pe care îl urmărim deja/) });
    expect(requested.length).toBe(before);
  });

  it('reads an uploaded file from the blob store', async () => {
    const blob = new FsBlobStore(blobRoot);
    await blob.put('merchant-feeds/1/feed.csv', 'id,title,price,link\nU1,Mouse Logitech M185 wireless,99.90,https://www.magazin-exemplu.ro/u1\n');
    const v = await validateMerchantFeed(checkDeps(), await merchant({ feedUploadKey: 'merchant-feeds/1/feed.csv' }));
    expect(v.report).toMatchObject({ source: 'upload', format: 'csv', offers: 1 });
  });

  it('caps an uploaded gzip after decoding (a small bomb never expands in memory)', async () => {
    const blob = new FsBlobStore(blobRoot);
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024, 0x20));
    expect(bomb.length).toBeLessThan(64 * 1024);
    await blob.put('merchant-feeds/1/bomb.gz', bomb);
    const v = await validateMerchantFeed({ ...checkDeps(), maxBytes: 1024 * 1024 }, await merchant({ feedUploadKey: 'merchant-feeds/1/bomb.gz' }));
    expect(v).toMatchObject({ status: 'failed', error: expect.stringMatching(/limita de 15 MB \(după dezarhivare\)/) });
  });

  it('drops a result when the address changed or a newer check was asked for while it ran', async () => {
    const url = 'https://www.magazin-exemplu.ro/race.xml';
    responses = new Map([[url, ok(url, GOOGLE)]]);
    const id = await merchant({ feedUrl: url, validation: { status: 'queued', requestedAt: 'r1' } });
    onFetch.set(url, async () => {
      // saveFeedUrl while the check of the old address is running
      await t.db.execute(sql`UPDATE merchants SET feed_url = 'https://www.magazin-exemplu.ro/alt.xml', validation = '{"status":"queued","requestedAt":"r2"}' WHERE id = ${id}`);
    });
    await validateMerchantFeed(checkDeps(), id);
    onFetch.delete(url);
    expect((await load(id)).validation).toEqual({ status: 'queued', requestedAt: 'r2' });
  });

  it('gives a listed merchant who chose "detect automatically" the parser of the new feed on the live source', async () => {
    const csvUrl = 'https://www.magazin-exemplu.ro/vechi.csv';
    const id = await merchant({ status: 'pending', shopName: 'Format Nou', domain: 'format-nou.ro', domainVerifiedAt: new Date(), feedUrl: csvUrl, feedFormat: 'csv', validation: passed({ feedUrl: csvUrl, domain: 'format-nou.ro' }) });
    const { sourceId } = await approveMerchant(t.db, id, 'test');
    const xmlUrl = 'https://feeds.exemplu.net/nou.xml';
    responses = new Map([[xmlUrl, ok(xmlUrl, GOOGLE.replaceAll('www.magazin-exemplu.ro', 'www.format-nou.ro'))]]);
    await t.db.execute(sql`UPDATE merchants SET feed_url = ${xmlUrl}, feed_format = NULL, validation = NULL WHERE id = ${id}`);
    await t.db.execute(sql`UPDATE shop_sources SET url = ${xmlUrl} WHERE id = ${sourceId}`);
    const v = await validateMerchantFeed(checkDeps(), id);
    expect(v.status).toBe('done');
    const src = (await t.db.execute<{ parser_key: string; format: string }>(sql`SELECT parser_key, format FROM shop_sources WHERE id = ${sourceId}`)).rows[0];
    expect(src).toEqual({ parser_key: 'feed-google-shopping', format: 'google' });
  });
});

describe('merchant.domain_check', () => {
  it('verifies through a DNS TXT record without touching the site', async () => {
    const id = await merchant();
    const before = requested.length;
    const check = await verifyMerchantDomain({ ...checkDeps(), resolveTxt: async () => [['v=spf1 -all'], ['pretoscop-verificare=', 'tok-123']] }, id);
    expect(check).toMatchObject({ status: 'done', dns: 'found', domain: 'magazin-exemplu.ro' });
    expect(requested.length).toBe(before);
    expect(await load(id)).toMatchObject({ verificationMethod: 'dns' });
    expect((await load(id)).domainVerifiedAt).toBeInstanceOf(Date);
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
    expect(await load(id)).toMatchObject({ verificationMethod: 'file' });

    // A page that merely contains the token (a reflected 404, a search page) is not the file.
    responses = new Map([['https://magazin-exemplu.ro/.well-known/pretoscop-verificare.txt', ok('x', `<p>Nu am găsit ${verificationValue('tok-123')}</p>`)]]);
    const other = await merchant();
    const missing = await verifyMerchantDomain({ ...checkDeps(), resolveTxt: noDns }, other);
    expect(missing).toMatchObject({ dns: 'missing', file: 'missing' });
    expect((await load(other)).domainVerifiedAt).toBeNull();
  });

  it('verifies nothing when the merchant switches to another domain while its own is being checked', async () => {
    const id = await merchant({ domain: 'al-meu.ro' });
    const check = await verifyMerchantDomain(
      {
        ...checkDeps(),
        resolveTxt: async () => {
          await t.db.execute(sql`UPDATE merchants SET domain = 'evomag.ro', domain_verified_at = NULL, domain_check = NULL WHERE id = ${id}`);
          return [[verificationValue('tok-123')]];
        },
      },
      id,
    );
    expect(check).toMatchObject({ dns: 'found', domain: 'al-meu.ro' });
    expect(await load(id)).toMatchObject({ domain: 'evomag.ro', domainVerifiedAt: null, verificationMethod: null, domainCheck: null });
  });

  it('never requests the verification file from a shop we already crawl (DNS or email only)', async () => {
    const id = await merchant({ domain: 'evomag.ro' });
    const before = requested.length;
    const check = await verifyMerchantDomain({ ...checkDeps(), resolveTxt: async () => [] }, id);
    expect(check).toMatchObject({ dns: 'missing', file: 'skipped' });
    expect(requested.length).toBe(before);
    expect((await load(id)).domainVerifiedAt).toBeNull();
  });
});

describe('merchant feed sources on the ingestion path', () => {
  async function approved(values: Partial<typeof merchants.$inferInsert>): Promise<number> {
    const v = {
      status: 'pending' as const,
      shopName: 'Magazin Exemplu',
      websiteUrl: 'https://www.magazin-exemplu.ro',
      domainVerifiedAt: new Date(),
      verificationMethod: 'email' as const,
      feedFormat: 'csv' as const,
      ...values,
    };
    const id = await merchant({ ...v, validation: passed(v) });
    return (await approveMerchant(t.db, id, 'test')).sourceId;
  }
  const deps = () => ({
    db: t.db,
    env,
    log,
    blob: new FsBlobStore(blobRoot),
    fetcher: crawlerFetcher,
    merchantFetcher: fetcher,
    normalize: createNormalize(() => null),
    alert: vi.fn(async () => undefined),
  });

  it('applies the declared price format, drops offers outside the verified domain and the merchant’s own affiliate links, on the merchant fetcher', async () => {
    const url = 'https://www.magazin-exemplu.ro/export.csv';
    const csv = [
      'id;title;price;link;deeplink',
      'K1;Cablu HDMI 2.1 Ugreen 2m negru;12.500;https://www.magazin-exemplu.ro/k1;https://tracker.exemplu.net/r?u=k1',
      'K2;Cablu HDMI 2.1 Ugreen 3m negru;19.900;https://www.alt-magazin.ro/k2;',
    ].join('\n');
    responses = new Map([[url, ok(url, csv)]]);
    const sourceId = await approved({ feedUrl: url, priceFormat: 'decimal' });
    const r = await runSource(deps(), sourceId, { trigger: 'manual' });
    expect(r.status).toBe('success');
    expect(r.stats).toMatchObject({ parsed: 1, upserted: 1, offDomain: 1 });
    const offers = await t.db.execute<{ external_id: string; price: string; source_tier: number; affiliate_url: string | null }>(
      sql`SELECT external_id, price::text, source_tier, affiliate_url FROM offers WHERE source_id = ${sourceId}`,
    );
    expect(offers.rows).toEqual([{ external_id: 'K1', price: '12.50', source_tier: 1, affiliate_url: null }]);
  });

  it('does not pull a merchant feed from the host of another shop we crawl', async () => {
    const before = requested.length;
    const sourceId = await approved({ domain: 'gazda-straina.ro', feedUrl: 'https://gazda-straina.ro/f.csv' });
    await t.db.execute(sql`UPDATE shop_sources SET url = 'https://www.evomag.ro/feed.csv' WHERE id = ${sourceId}`);
    const r = await runSource(deps(), sourceId, { trigger: 'manual' });
    expect(r.status).not.toBe('success');
    expect(requested.length).toBe(before);
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

  it('refuses an uploaded gzip that decodes past the cap', async () => {
    const blob = new FsBlobStore(blobRoot);
    await blob.put('merchant-feeds/3/bomb.csv.gz', gzipSync(Buffer.alloc(20 * 1024 * 1024, 0x20)));
    const sourceId = await approved({ domain: 'bomba.ro', feedUploadKey: 'merchant-feeds/3/bomb.csv.gz', feedUploadedAt: new Date() });
    const r = await runSource({ ...deps(), env: { ...env, FETCH_MAX_BODY_BYTES: 1024 * 1024 } }, sourceId, { trigger: 'manual' });
    expect(r.status).not.toBe('success');
    const run = await t.db.execute<{ error_sample: string }>(sql`SELECT error_sample FROM ingest_runs WHERE source_id = ${sourceId}`);
    expect(run.rows[0]!.error_sample).toMatch(/too large/);
  });

  it('shops:sync leaves merchant feeds on registry shops alone', async () => {
    await t.db.execute(sql`UPDATE shops SET status = 'active', access_mode = 'feed_only' WHERE slug = 'evomag'`);
    const values = { domain: 'evomag.ro', status: 'pending' as const, shopName: 'evoMAG', domainVerifiedAt: new Date(), feedUrl: 'https://www.evomag.ro/feed.xml', feedFormat: 'google' as const };
    const id = await merchant({ ...values, validation: passed(values) });
    const evomag = (await t.db.execute<{ id: number }>(sql`SELECT id::int AS id FROM shops WHERE slug = 'evomag'`)).rows[0]!.id;
    const { sourceKey } = await approveMerchant(t.db, id, 'test', { confirmShopId: evomag });
    const report = await syncShops(t.db);
    expect(report.changes).not.toContain(`source ${sourceKey}: disabled (removed from YAML)`);
    const src = await t.db.execute<{ enabled: boolean }>(sql`SELECT enabled FROM shop_sources WHERE key = ${sourceKey}`);
    expect(src.rows[0]!.enabled).toBe(true);
  });
});

describe('the real merchant fetcher (SSRF guard, scoped fetch state)', () => {
  const servers: http.Server[] = [];
  /** A fixture shop on its own port (each test gets fresh per-host fetch state). */
  async function shopServer() {
    const s = { served: 0, origin: '', host: '' };
    const server = http.createServer((req, res) => {
      s.served++;
      if (req.url === '/robots.txt') return res.end('User-agent: *\nAllow: /\n');
      if (req.url === '/feed.xml') {
        res.setHeader('content-type', 'application/xml');
        return res.end(GOOGLE);
      }
      res.statusCode = 403;
      res.end('Forbidden');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    s.origin = `http://127.0.0.1:${port}`;
    s.host = `127.0.0.1:${port}`;
    return s;
  }
  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  function realMerchantFetcher(allowPrivate: boolean) {
    const dispatcher = createGuardedDispatcher({ allowPrivate });
    const requestLog = { write: () => undefined };
    return createMerchantFetcher(env, t.db, log, { dispatcher, requestLog, stateStore: new PgDomainStateStore(t.db) }, { sleep: async () => undefined });
  }

  it('refuses a private address with the guard on: nothing reaches the server', async () => {
    const shop = await shopServer();
    const id = await merchant({ feedUrl: `${shop.origin}/feed.xml` });
    const v = await validateMerchantFeed({ ...checkDeps(), fetcher: realMerchantFetcher(false) }, id);
    expect(v).toMatchObject({ status: 'failed', error: 'Adresa feed-ului nu este o adresă publică de internet.' });
    expect(shop.served).toBe(0);
  });

  it('a 403 provoked through a merchant URL pauses the merchant scope only, never the crawler', async () => {
    const { origin, host } = await shopServer();
    const id = await merchant({ feedUrl: `${origin}/?q=%3Cscript%3E` });
    const v = await validateMerchantFeed({ ...checkDeps(), fetcher: realMerchantFetcher(true) }, id);
    expect(v).toMatchObject({ status: 'failed', detail: expect.stringMatching(/status=403/) });
    const state = await t.db.execute<{ host: string; paused: boolean }>(
      sql`SELECT host, paused_until > now() AS paused FROM fetch_domain_state WHERE host IN (${host}, ${`merchant:${host}`}) ORDER BY host`,
    );
    expect(state.rows).toEqual([
      { host, paused: null },
      { host: `merchant:${host}`, paused: true },
    ]);
    const robots = await t.db.execute<{ origin: string }>(sql`SELECT origin FROM fetch_robots_cache WHERE origin LIKE ${`%${host}`}`);
    expect(robots.rows.map((r) => r.origin)).toEqual([`merchant:${origin}`]);
  });
});
