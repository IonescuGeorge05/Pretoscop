import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import type { RawOffer } from '@pretoscop/core';
import { setFlag } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { FsBlobStore } from '@pretoscop/storage';
import { runSource } from '../src/recorder/run-source';
import type { FetchLike, NormalizeFn } from '../src/recorder/types';
import { syncShops } from '../src/registry/sync';

const FIX = fileURLToPath(new URL('../../../packages/extractors/fixtures/', import.meta.url));
const fixture = (p: string) => readFileSync(FIX + p, 'utf8');

const PAGES: Record<string, string> = {
  'https://www.emag.ro/telefoane-mobile/c': fixture('emag/listing_2026-10-27.html'),
  'https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/':
    fixture('emag/product_2026-10-27.html'),
  'https://www.itgalaxy.ro/data/sitemaps/index.xml': fixture('itgalaxy/sitemap-index_2026-10-27.xml'),
  'https://www.itgalaxy.ro/data/sitemaps/products-latest-0.xml': fixture('itgalaxy/sitemap-products-latest_2026-10-27.xml'),
  'https://www.itgalaxy.ro/televizoare/samsung/samsung-ue55u8072h-139-7-cm-55-4k-ultra-hd-smart-tv-wi-fi-black-987970/':
    fixture('itgalaxy/product_2026-10-27.html'),
};

let blocked = new Set<string>();
const requested: string[] = [];
const fetcher: FetchLike = {
  async fetchPolite(url) {
    requested.push(url);
    if (blocked.has(url)) {
      return { status: 403, ok: false, blocked: true, blockReason: 'http_403', body: null, finalUrl: url, channel: 'direct' };
    }
    const body = PAGES[url];
    return body
      ? { status: 200, ok: true, blocked: false, body, finalUrl: url, channel: 'direct' }
      : { status: 404, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' };
  },
};

/** Minimal normalizer for the pipeline test (M06 provides the real one). */
const normalize: NormalizeFn = (raw: RawOffer, ctx) => {
  const txt = raw.priceFormat === 'ro' ? raw.price.replace(/[^\d,]/g, '').replace(',', '.') : raw.price.replace(/[^\d.]/g, '');
  const priceBani = Math.round(Number(txt) * 100);
  if (!Number.isFinite(priceBani) || priceBani <= 100) return { rejectReason: 'unparseable price' };
  const availability = /in_stock|InStock|limited/.test(raw.availability ?? '') ? 'in_stock' : 'unknown';
  const contentHash = createHash('sha256').update(`${priceBani}|${availability}`).digest('hex');
  return {
    observation: {
      shopId: ctx.shop.id,
      sourceId: ctx.sourceId,
      sourceTier: ctx.sourceTier,
      runId: ctx.runId,
      externalId: raw.externalId,
      url: raw.url,
      titleRaw: raw.title,
      priceBani,
      totalBani: priceBani,
      availability,
      condition: 'new',
      sellerName: raw.sellerName ?? null,
      sellerType: raw.isMarketplaceSeller ? 'marketplace' : 'shop',
      contentHash,
      observedAt: ctx.observedAt,
    },
  };
};

let t: TestDatabase;
let blobRoot: string;
const alert = vi.fn(async () => undefined);
const env = { ...getEnv({}), CRAWL_ENABLED: true };
const log = createLogger('test', { level: 'silent' });

async function sourceId(key: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shop_sources WHERE key = ${key}`);
  return Number(r.rows[0]!.id);
}
const deps = () => ({ db: t.db, env, log, blob: new FsBlobStore(blobRoot), fetcher, normalize, alert });

beforeAll(async () => {
  t = await createTestDatabase();
  blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-rec-'));
  await syncShops(t.db);
  await setFlag(t.db, 'crawl.enabled', true);
});
afterAll(async () => {
  await t?.drop();
  rmSync(blobRoot, { recursive: true, force: true });
});

describe('source.run gates', () => {
  it('eMAG does not run without its ADR-013 flag', async () => {
    const r = await runSource(deps(), await sourceId('emag:listing:telefoane-mobile'), { trigger: 'manual', maxPages: 1 });
    expect(r).toMatchObject({ status: 'gated', reason: expect.stringMatching(/source\.emag\.enabled/) });
    expect(requested).toEqual([]);
  });

  it('blocked shops and disabled sources never run', async () => {
    const r = await runSource(deps(), await sourceId('evomag:feed:2performant'), { trigger: 'manual' });
    expect(r.status).toBe('gated');
  });
});

describe('eMAG listing → offers, events, snapshot, frontier', () => {
  it('records 60 offers with first events and a snapshot', async () => {
    await setFlag(t.db, 'source.emag.enabled', true);
    const r = await runSource(deps(), await sourceId('emag:listing:telefoane-mobile'), { trigger: 'manual', maxPages: 1 });
    expect(r.status).toBe('success');
    expect(r.stats).toMatchObject({ fetched: 1, parsed: 60, upserted: 60, changed: 60, blocked: 0, errors: 0 });
    const ev = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text n FROM price_events`);
    expect(Number(ev.rows[0]!.n)).toBe(60);
    const run = await t.db.execute<{ snapshot_key: string; status: string }>(sql`SELECT snapshot_key, status FROM ingest_runs WHERE id = ${r.runId}`);
    const key = run.rows[0]!.snapshot_key;
    expect(key).toMatch(/^snapshots\/emag\/\d+\/\d+\.jsonl\.gz$/);
    const lines = gunzipSync(Buffer.from((await new FsBlobStore(blobRoot).get(key))!)).toString().trim().split('\n');
    expect(lines).toHaveLength(60);
    const frontier = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text n FROM crawl_urls`);
    expect(Number(frontier.rows[0]!.n)).toBe(60);
  });

  it('a second identical run writes no new events (change-only history)', async () => {
    const r = await runSource(deps(), await sourceId('emag:listing:telefoane-mobile'), { trigger: 'manual', maxPages: 1 });
    expect(r.stats).toMatchObject({ parsed: 60, upserted: 60, changed: 0 });
    const health = await t.db.execute<{ health: string }>(sql`SELECT health FROM shop_sources WHERE key = 'emag:listing:telefoane-mobile'`);
    expect(health.rows[0]!.health).toBe('ok');
  });

  it('Tier A product pages add every seller of the most popular products', async () => {
    await t.db.execute(sql`UPDATE crawl_urls SET priority = 1e6 WHERE url LIKE '%DF1MLR2BM%'`);
    const r = await runSource(deps(), await sourceId('emag:product:tier-a'), { trigger: 'manual', budget: 1 });
    expect(r.status).toBe('success');
    expect(r.stats.parsed).toBe(9);
    const sellers = await t.db.execute<{ seller_name: string; seller_type: string }>(
      sql`SELECT seller_name, seller_type FROM offers WHERE url LIKE '%DF1MLR2BM%' ORDER BY seller_name`,
    );
    expect(sellers.rows.map((s) => s.seller_name)).toEqual(expect.arrayContaining(['eMAG', 'TelefonulTau', 'Flanco']));
    expect(sellers.rows.find((s) => s.seller_name === 'eMAG')?.seller_type).toBe('shop');
    expect(sellers.rows.find((s) => s.seller_name === 'TelefonulTau')?.seller_type).toBe('marketplace');
  });
});

describe('sitemap source → discovery + product pages', () => {
  it('discovers URLs from the index (include filter) and fetches product pages', async () => {
    requested.length = 0;
    const id = await sourceId('itgalaxy:sitemap:produse');
    // Make the recorded product page the first pick.
    const r1 = await runSource(deps(), id, { trigger: 'manual', budget: 0.0001 });
    expect(r1.stats.discovered).toBeGreaterThan(5000);
    await t.db.execute(sql`UPDATE crawl_urls SET priority = 1e6 WHERE url LIKE '%987970%'`);
    await t.db.execute(sql`UPDATE crawl_urls SET last_fetched_at = now() WHERE url NOT LIKE '%987970%' AND shop_id = (SELECT id FROM shops WHERE slug='itgalaxy')`);
    const r2 = await runSource(deps(), id, { trigger: 'manual', budget: 1 });
    expect(r2.stats).toMatchObject({ parsed: 1, upserted: 1 });
    const o = await t.db.execute<{ price: string }>(sql`SELECT price FROM offers WHERE external_id = '987970'`);
    expect(o.rows[0]!.price).toBe('1975.99');
  });
});

describe('blocks and alerts', () => {
  it('a blocked run fails, marks the source blocked, and two failures alert', async () => {
    blocked = new Set(['https://www.emag.ro/telefoane-mobile/c']);
    const id = await sourceId('emag:listing:telefoane-mobile');
    const r1 = await runSource(deps(), id, { trigger: 'manual', maxPages: 1 });
    expect(r1).toMatchObject({ status: 'failed', stats: { blocked: 1 } });
    await runSource(deps(), id, { trigger: 'manual', maxPages: 1 });
    const h = await t.db.execute<{ health: string; consecutive_failures: number }>(
      sql`SELECT health, consecutive_failures FROM shop_sources WHERE id = ${id}`,
    );
    expect(h.rows[0]).toEqual({ health: 'blocked', consecutive_failures: 2 });
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/failing twice/), expect.anything());
    blocked = new Set();
  });

  it('a host the fetch layer already paused is gated: no run, no request, no new failure', async () => {
    const id = await sourceId('emag:listing:tablete');
    await t.db.execute(sql`
      INSERT INTO fetch_domain_state (host, paused_until, pause_reason, pause_set_at, pause_source)
      VALUES ('www.emag.ro', now() + interval '1 day', 'challenge: test', now(), 'auto')
      ON CONFLICT (host) DO UPDATE SET paused_until = EXCLUDED.paused_until, pause_reason = EXCLUDED.pause_reason`);
    const runsBefore = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM ingest_runs WHERE source_id = ${id}`);
    const r = await runSource(deps(), id, { trigger: 'manual', maxPages: 1 });
    expect(r).toMatchObject({ runId: null, status: 'gated' });
    expect(r.reason).toMatch(/www\.emag\.ro paused until .*challenge: test/);
    const runsAfter = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM ingest_runs WHERE source_id = ${id}`);
    expect(runsAfter.rows[0]!.n).toBe(runsBefore.rows[0]!.n);
    await t.db.execute(sql`UPDATE fetch_domain_state SET paused_until = NULL WHERE host = 'www.emag.ro'`);
  });
});
