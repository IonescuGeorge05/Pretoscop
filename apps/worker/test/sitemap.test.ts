import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSitemapXml } from '@pretoscop/core';
import { recordObservation, seedDev, sql, syncTaxonomy } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { FsBlobStore } from '@pretoscop/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSitemaps } from '../src/sitemap/build';

// sitemap.build (M16) on a throwaway database: only indexable product pages (core
// isProductIndexable: ≥ 2 live offers or ≥ 14 observed days, never provisional), categories and
// brands with indexable products, curated brand × category pages from 3 indexable products, covered
// shops; files of at most N URLs; files of an earlier, larger build removed.

const BASE = 'https://pretoscop.ro';
let t: TestDatabase;
let dir: string;
let blob: FsBlobStore;
const ids: Record<string, number> = {};
const shop: Record<string, number> = {};

interface Spec {
  key: string;
  brand: string;
  category: string;
  offers: Array<{ shop: string; hoursAgo: number }>;
  days?: number;
  provisional?: boolean;
  status?: 'active' | 'hidden';
}

async function product(s: Spec): Promise<void> {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, brand_id, category_id, provisional, status)
    VALUES (${`${s.key}-tmp`}, ${`Produs ${s.key}`}, ${`produs ${s.key}`}, (SELECT id FROM brands WHERE slug = ${s.brand}),
      (SELECT id FROM categories WHERE slug = ${s.category}), ${s.provisional ?? false}, ${s.status ?? 'active'})
    RETURNING id::text`);
  const id = Number(r.rows[0]!.id);
  await t.db.execute(sql`UPDATE products SET slug = ${`${s.key}-${id}`} WHERE id = ${id}`);
  ids[s.key] = id;
  for (const [i, o] of s.offers.entries()) {
    const ext = `${s.key}-${i}`;
    await recordObservation(t.db, {
      shopId: shop[o.shop]!, sourceId: null, sourceTier: 1, runId: null, externalId: ext, url: `https://example.ro/${ext}`, titleRaw: `Produs ${s.key}`,
      priceBani: 100_000 + i, totalBani: 100_000 + i, availability: 'in_stock', condition: 'new',
      contentHash: createHash('sha256').update(ext).digest('hex'), observedAt: new Date(Date.now() - o.hoursAgo * 3_600_000),
    });
    await t.db.execute(sql`UPDATE offers SET product_id = ${id}, match_status = 'auto' WHERE external_id = ${ext}`);
  }
  if (s.days !== undefined) await t.db.execute(sql`INSERT INTO product_stats (product_id, observations_days, verdict) VALUES (${id}, ${s.days}, 'usual')`);
}

const read = async (name: string) => Buffer.from((await blob.get(`sitemaps/${name}`))!).toString('utf8');
const locsOf = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(BASE, ''));

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  await syncTaxonomy(t.db);
  await t.db.execute(sql`INSERT INTO shops (slug, name, domain, website_url, kind, status) VALUES ('altex', 'Altex', 'altex.ro', 'https://altex.ro', 'retail', 'blocked')`);
  for (const r of (await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`)).rows) shop[r.slug] = Number(r.id);
  await t.db.execute(sql`INSERT INTO brands (name, slug) VALUES ('Samsung', 'samsung'), ('Sony', 'sony'), ('Nokia', 'nokia')`);
  const live = (n: number) => Array.from({ length: n }, (_, i) => ({ shop: i % 2 ? 'dedeman' : 'emag', hoursAgo: 1 }));
  await product({ key: 'tv-two-offers', brand: 'samsung', category: 'televizoare', offers: live(2) });
  await product({ key: 'tv-long-history', brand: 'samsung', category: 'televizoare', offers: live(1), days: 20 });
  await product({ key: 'tv-three', brand: 'samsung', category: 'televizoare', offers: live(2) });
  await product({ key: 'tv-thin', brand: 'samsung', category: 'televizoare', offers: live(1), days: 3 });
  await product({ key: 'tv-provisional', brand: 'samsung', category: 'televizoare', offers: live(3), days: 30, provisional: true });
  await product({ key: 'tv-hidden', brand: 'samsung', category: 'televizoare', offers: live(2), status: 'hidden' });
  await product({ key: 'tv-stale', brand: 'samsung', category: 'televizoare', offers: [{ shop: 'emag', hoursAgo: 72 }, { shop: 'dedeman', hoursAgo: 72 }] });
  await product({ key: 'console', brand: 'sony', category: 'console', offers: live(2) });
  await product({ key: 'phone-thin', brand: 'nokia', category: 'telefoane-mobile', offers: live(1) });
  dir = mkdtempSync(join(tmpdir(), 'pretoscop-sitemap-'));
  blob = new FsBlobStore(dir);
  // A file left by an earlier, larger build: removed by the next one.
  await blob.put('sitemaps/products-9.xml', '<old/>');
});

afterAll(async () => {
  await t?.drop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('sitemap.build (M16)', () => {
  it('lists only indexable product pages, in files of at most N URLs, all valid', async () => {
    const m = await buildSitemaps({ db: t.db, blob, baseUrl: `${BASE}/`, maxUrlsPerFile: 2 });
    const products = m.files.filter((f) => f.name.startsWith('products-'));
    expect(products.map((f) => [f.name, f.urls])).toEqual([
      ['products-1.xml', 2],
      ['products-2.xml', 2],
    ]);
    const urls: string[] = [];
    for (const f of m.files) {
      const xml = await read(f.name);
      expect(validateSitemapXml(xml, { host: 'pretoscop.ro' }), f.name).toEqual([]);
      if (f.name.startsWith('products-')) urls.push(...locsOf(xml));
    }
    const slug = (k: string) => `/p/${k}-${ids[k]}`;
    expect(urls.sort()).toEqual([slug('tv-two-offers'), slug('tv-long-history'), slug('tv-three'), slug('console')].sort());
    for (const k of ['tv-thin', 'tv-provisional', 'tv-hidden', 'tv-stale', 'phone-thin']) expect(urls).not.toContain(slug(k));
    // lastmod = the last price change of a live offer (W3C datetime).
    expect(await read('products-1.xml')).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/lastmod>/);
  });

  it('lists categories and brands with indexable products, curated brand × category pages from 3, covered shops', async () => {
    await buildSitemaps({ db: t.db, blob, baseUrl: BASE });
    // Leaves and their parents; phones have no indexable product.
    expect(locsOf(await read('categories.xml')).sort()).toEqual(['/c/gaming', '/c/gaming/console', '/c/tv-audio', '/c/tv-audio/televizoare']);
    expect(locsOf(await read('brands.xml')).sort()).toEqual(['/b/samsung', '/b/samsung/televizoare', '/b/sony']);
    expect(locsOf(await read('shops.xml')).sort()).toEqual(['/magazin/dedeman', '/magazin/emag']);
  });

  it('writes a manifest of the files and removes files of an earlier, larger build', async () => {
    const m = await buildSitemaps({ db: t.db, blob, baseUrl: BASE });
    expect(m.files.map((f) => f.name)).toEqual(['products-1.xml', 'categories.xml', 'brands.xml', 'shops.xml']);
    expect(m.files[0]).toMatchObject({ urls: 4 });
    const keys = (await blob.list('sitemaps/')).map((k) => k.key).sort();
    expect(keys).toEqual(['sitemaps/brands.xml', 'sitemaps/categories.xml', 'sitemaps/manifest.json', 'sitemaps/products-1.xml', 'sitemaps/shops.xml']);
    const manifest = JSON.parse(Buffer.from((await blob.get('sitemaps/manifest.json'))!).toString('utf8')) as typeof m;
    expect(manifest).toMatchObject({ baseUrl: BASE, files: m.files });
  });
});
