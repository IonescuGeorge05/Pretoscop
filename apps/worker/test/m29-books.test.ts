/**
 * M29: the book sources through the real recorder (`source.run`), normalizer and matcher, against
 * the fixtures recorded on 2026-11-09 and served by a fake fetcher. Nothing leaves the machine.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { categoryCoverage, matchOffer, merchantDomainsShown, pendingOffers, setFlag, syncTaxonomy } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { FsBlobStore } from '@pretoscop/storage';
import { categoryItemListPresent, checkoutRoutes } from '../src/cli/css-readiness';
import { runSource } from '../src/recorder/run-source';
import type { FetchLike } from '../src/recorder/types';
import { syncShops } from '../src/registry/sync';
import { createNormalize } from '../src/services';

const FIX = fileURLToPath(new URL('../../../packages/extractors/fixtures/', import.meta.url));
const fixture = (p: string) => readFileSync(FIX + p, 'utf8');

const HP = 'https://www.libris.ro/carte/harry-potter-si-printul-semisange-j-k-rowling/42444997';
const TUP = 'https://www.elefant.ro/tup-imposibil-e-doar-un-cuvant-cartea-intai-editia-a-iii-a_d5566ae4-f147-4c46-948c-1c817d6ae3a1';
const PAGES: Record<string, string> = {
  'https://www.libris.ro/carti/carti-pentru-copii/literatura-fantasy': fixture('libris/listing-carti-copii-fantasy_2026-11-09.html'),
  [HP]: fixture('libris/product-harry-potter-printul-semisange_2026-11-09.html'),
  'https://www.elefant.ro/list/carti/carte/carti-pentru-copii': fixture('elefant/listing-carti-pentru-copii_2026-11-09.html'),
  [TUP]: fixture('elefant/product-tup-imposibil-cartea-intai_2026-11-09.html'),
  // A redesigned page without product links.
  'https://www.elefant.ro/list/carti/carte/fictiune/young-adult': '<!doctype html><html><body><p>Nimic</p></body></html>',
};

const requested: string[] = [];
const fetcher: FetchLike = {
  async fetchPolite(url) {
    requested.push(url);
    const body = PAGES[url];
    return body
      ? { status: 200, ok: true, blocked: false, body, finalUrl: url, channel: 'direct' }
      : { status: 404, ok: false, blocked: false, body: null, finalUrl: url, channel: 'direct' };
  },
};

let t: TestDatabase;
let blobRoot: string;
const env = { ...getEnv({}), CRAWL_ENABLED: true };
const deps = () => ({
  db: t.db,
  env,
  log: createLogger('test', { level: 'silent' }),
  blob: new FsBlobStore(blobRoot),
  fetcher,
  normalize: createNormalize(() => 5),
  alert: vi.fn(async () => undefined),
});

async function sourceId(key: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shop_sources WHERE key = ${key}`);
  if (!r.rows[0]) throw new Error(`no source ${key}`);
  return Number(r.rows[0].id);
}

/** M29 sources ship disabled: the test database enables the ones it runs. */
async function enable(key: string): Promise<number> {
  await t.db.execute(sql`UPDATE shop_sources SET enabled = true WHERE key = ${key}`);
  return sourceId(key);
}

beforeAll(async () => {
  t = await createTestDatabase();
  blobRoot = mkdtempSync(join(tmpdir(), 'pretoscop-m29-'));
  await syncShops(t.db);
  await syncTaxonomy(t.db);
  await setFlag(t.db, 'crawl.enabled', true);
});
afterAll(async () => {
  await t?.drop();
  rmSync(blobRoot, { recursive: true, force: true });
});

describe('M29 book sources through source.run', () => {
  it('every M29 source is registered disabled', async () => {
    const r = await t.db.execute<{ key: string; enabled: boolean }>(sql`
      SELECT s.key, s.enabled FROM shop_sources s JOIN shops sh ON sh.id = s.shop_id WHERE sh.slug IN ('libris', 'elefant') ORDER BY s.key`);
    expect(r.rows.length).toBe(15);
    expect(r.rows.every((x) => !x.enabled)).toBe(true);
    const gated = await runSource(deps(), await sourceId('libris:listing:carti-copii-fantasy'), { trigger: 'manual', maxPages: 1 });
    expect(gated).toMatchObject({ status: 'gated', reason: 'source disabled' });
    expect(requested).toEqual([]);
  });

  it('Libris listing: 40 book offers, publisher as brand, no ISBN yet; product URLs queued', async () => {
    const r = await runSource(deps(), await enable('libris:listing:carti-copii-fantasy'), { trigger: 'manual', maxPages: 1 });
    expect(r).toMatchObject({ status: 'success', stats: { fetched: 1, parsed: 40, upserted: 40, errors: 0 } });
    const rows = await t.db.execute<{ external_id: string; price: string; old_price: string | null; brand_name: string | null; gtin14: string | null; attributes: Record<string, unknown> }>(sql`
      SELECT o.external_id, o.price::text, o.old_price::text, o.brand_name, o.gtin14, o.attributes FROM offers o JOIN shops s ON s.id = o.shop_id WHERE s.slug = 'libris'`);
    expect(rows.rows).toHaveLength(40);
    expect(rows.rows.find((o) => o.external_id === '42444997')).toMatchObject({ price: '78.78', old_price: null, brand_name: 'Art', gtin14: null });
    expect(rows.rows.find((o) => o.external_id === '42444997')!.attributes).toMatchObject({ kind: 'book', bookAuthors: ['J.K. Rowling'] });
    const urls = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM crawl_urls c JOIN shops s ON s.id = c.shop_id WHERE s.slug = 'libris'`);
    expect(Number(urls.rows[0]!.n)).toBe(40);
  });

  it('Libris product page adds the ISBN to the same offer; the next listing run keeps it', async () => {
    const r = await runSource(deps(), await enable('libris:product:isbn'), { trigger: 'manual', budget: 40 });
    expect(r.stats).toMatchObject({ parsed: 1, upserted: 1 });
    const one = async () =>
      (await t.db.execute<{ gtin14: string | null; n: string }>(sql`
        SELECT max(o.gtin14) AS gtin14, count(*)::text AS n FROM offers o JOIN shops s ON s.id = o.shop_id WHERE s.slug = 'libris' AND o.external_id = '42444997'`)).rows[0]!;
    expect(await one()).toEqual({ gtin14: '09786303218656', n: '1' });
    await runSource(deps(), await sourceId('libris:listing:carti-copii-fantasy'), { trigger: 'manual', maxPages: 1 });
    expect((await one()).gtin14).toBe('09786303218656');
  });

  it('Elefant: the discovery listing queues 59 product links and records no offer', async () => {
    const r = await runSource(deps(), await enable('elefant:listing:carti-pentru-copii'), { trigger: 'manual', maxPages: 1 });
    expect(r).toMatchObject({ status: 'success', stats: { fetched: 1, parsed: 0, upserted: 0, discovered: 59, errors: 0 } });
    const urls = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM crawl_urls c JOIN shops s ON s.id = c.shop_id WHERE s.slug = 'elefant'`);
    expect(Number(urls.rows[0]!.n)).toBe(59);
    // A page without links is an error, not an empty success; nothing is deactivated either way.
    const broken = await runSource(deps(), await enable('elefant:listing:young-adult'), { trigger: 'manual', maxPages: 1 });
    expect(broken.status).toBe('failed');
    expect(broken.stats.errors).toBe(1);
  });

  it('Elefant product pages: price, ISBN and publisher; gone pages are marked', async () => {
    const r = await runSource(deps(), await enable('elefant:product:carti'), { trigger: 'manual', budget: 59 });
    expect(r.stats).toMatchObject({ parsed: 1, upserted: 1 });
    const o = await t.db.execute<{ price: string; old_price: string; gtin14: string; brand_name: string; availability: string }>(sql`
      SELECT o.price::text, o.old_price::text, o.gtin14, o.brand_name, o.availability FROM offers o JOIN shops s ON s.id = o.shop_id WHERE s.slug = 'elefant'`);
    expect(o.rows).toEqual([{ price: '41.40', old_price: '69.00', gtin14: '09786064402332', brand_name: 'Curtea Veche', availability: 'in_stock' }]);
    const gone = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM crawl_urls c JOIN shops s ON s.id = c.shop_id WHERE s.slug = 'elefant' AND c.gone_at IS NOT NULL`);
    expect(Number(gone.rows[0]!.n)).toBe(58);
  });

  it('matching: ISBN offers become provisional book products; title-only cards stay out', async () => {
    const pending = await pendingOffers(t.db, 500);
    const outcomes = [];
    for (const p of pending) outcomes.push(await matchOffer(t.db, p));
    const hp = outcomes.find((x) => pending.find((p) => p.id === x.offerId)?.externalId === '42444997')!;
    expect(hp).toMatchObject({ decision: 'new_product', category: 'beletristica', reasons: ['valid ISBN + publisher'] });
    const tup = outcomes.find((x) => pending.find((p) => p.id === x.offerId)?.externalId === 'd5566ae4-f147-4c46-948c-1c817d6ae3a1')!;
    expect(tup).toMatchObject({ decision: 'new_product', category: 'carti-pentru-copii' });
    // The 39 other Libris cards have no ISBN yet: never a product from a title alone.
    expect(outcomes.filter((x) => x.decision === 'new_product')).toHaveLength(2);
    expect(outcomes.filter((x) => x.decision === 'accept')).toHaveLength(0);
    const products = await t.db.execute<{ provisional: boolean; category: string; brand: string }>(sql`
      SELECT p.provisional, c.slug AS category, b.name AS brand FROM products p JOIN categories c ON c.id = p.category_id JOIN brands b ON b.id = p.brand_id ORDER BY p.id`);
    expect(products.rows).toEqual([
      { provisional: true, category: 'beletristica', brand: 'Art' },
      { provisional: true, category: 'carti-pentru-copii', brand: 'Curtea Veche' },
    ]);
  });

  it('CSS readiness counts the merchant domains whose offers are shown, and book coverage', async () => {
    const shown = await merchantDomainsShown(t.db);
    expect(shown.map((s) => s.domain).sort()).toEqual(['elefant.ro', 'libris.ro']);
    expect(shown.find((s) => s.slug === 'libris')).toMatchObject({ liveOffers: 1, products: 1 });
    const coverage = await categoryCoverage(t.db);
    expect(coverage).toEqual([{ root: 'carti', products: 2, withTwoOffers: 0, withTwoShops: 0, withThreeShops: 0 }]);
  });

  it('CSS code facts: no checkout route in the web app, ItemList on category pages', () => {
    expect(checkoutRoutes()).toEqual([]);
    expect(categoryItemListPresent()).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'pretoscop-m29-app-'));
    mkdirSync(join(dir, '(shop)', 'cos'), { recursive: true });
    expect(checkoutRoutes(dir)).toEqual(['/(shop)/cos']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('never requested anything the fixtures do not hold besides the product pages it tried', () => {
    expect(requested.every((u) => u.startsWith('https://www.libris.ro/') || u.startsWith('https://www.elefant.ro/'))).toBe(true);
  });
});
