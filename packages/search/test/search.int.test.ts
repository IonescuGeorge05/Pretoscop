import { createHash, randomBytes } from 'node:crypto';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { recordObservation, seedDev, sql, syncTaxonomy } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMeili, type EnqueuedTask } from '../src/client';
import { buildProductDocument } from '../src/document';
import { listProducts, searchProducts, suggest } from '../src/operations';
import { parseSearchParams, type SearchResult } from '../src/query';
import { PRODUCT_SETTINGS, indexNames } from '../src/settings';
import { indexProductIds, readMeta, rebuildAll, syncChanged } from '../src/sync';
import { GTIN_24, catalogueRows } from './catalogue';

// Integration tests against the dev Meilisearch (throwaway indexes with a random prefix) and a
// throwaway PostgreSQL database. `SEARCH_INTEGRATION=1` (make verify) turns "unreachable" into a
// failure instead of a skip.
loadRootEnvFile();
const env = getEnv();
const meili = createMeili({ url: env.MEILI_URL, apiKey: env.MEILI_MASTER_KEY });
const reachable = await meili.healthy();
if (!reachable && process.env.SEARCH_INTEGRATION === '1') throw new Error(`Meilisearch is not reachable at ${env.MEILI_URL}`);

// Under this checkout's MEILI_INDEX_PREFIX, so parallel checkouts sharing one Meilisearch never collide.
const prefix = `${env.MEILI_INDEX_PREFIX}test_${randomBytes(3).toString('hex')}_`;
const names = indexNames(prefix);

async function dropAll() {
  const list = await meili.request<{ results: Array<{ uid: string }> }>('GET', '/indexes?limit=1000');
  for (const i of list.results.filter((x) => x.uid.startsWith(prefix))) await meili.waitForTask(await meili.request<EnqueuedTask>('DELETE', `/indexes/${i.uid}`));
}

const ids = (r: SearchResult) => r.hits.map((h) => h.id);
const search = (q: string, extra: Record<string, string | string[]> = {}) => searchProducts(meili, names, parseSearchParams({ q, ...extra }));

describe.skipIf(!reachable)('relevance on a Romanian catalogue (M14 acceptance queries)', () => {
  beforeAll(async () => {
    await meili.waitForTask(await meili.request<EnqueuedTask>('POST', '/indexes', { uid: names.products, primaryKey: 'id' }));
    await meili.waitForTask(await meili.request<EnqueuedTask>('PATCH', `/indexes/${names.products}/settings`, PRODUCT_SETTINGS));
    await meili.waitForTask(await meili.request<EnqueuedTask>('POST', `/indexes/${names.products}/documents`, catalogueRows().map(buildProductDocument)));
  });
  afterAll(dropAll);

  it('"televizor samsung 55": Samsung 55" TVs only', async () => {
    const r = await search('televizor samsung 55');
    expect(new Set(ids(r))).toEqual(new Set([1, 2]));
    expect(r.matching).toBe('all');
    // Same with the words in another order (the size comes from the extracted screen attribute).
    expect(new Set(ids(await search('televizor 55 samsung')))).toEqual(new Set([1, 2]));
  });

  it('a typo still finds TVs ("televzor"), and "tv" is a synonym', async () => {
    expect(new Set(ids(await search('televzor samsung')))).toEqual(new Set([1, 2, 3, 6]));
    expect(new Set(ids(await search('tv samsung')))).toEqual(new Set([1, 2, 3, 6]));
  });

  it('"frigider": fridges and fridge-freezers, plural and "side by side"', async () => {
    const all = new Set([7, 8, 9, 10]);
    expect(new Set(ids(await search('frigider')))).toEqual(all);
    expect(new Set(ids(await search('frigidere')))).toEqual(all);
    expect(ids(await search('frigider side by side'))[0]).toBe(8);
    expect(new Set(ids(await search('frigider negru')))).toEqual(new Set([7, 8]));
  });

  it('"ps5" and "playstation 5" find the same consoles', async () => {
    expect(new Set(ids(await search('ps5')))).toEqual(new Set([11, 12]));
    expect(new Set(ids(await search('playstation 5')))).toEqual(new Set([11, 12]));
    expect(ids(await search('ps5 pro'))[0]).toBe(12);
  });

  it('"laptop asus 16gb": ASUS laptops with 16 GB, not 32 GB or other brands', async () => {
    expect(new Set(ids(await search('laptop asus 16gb')))).toEqual(new Set([15, 16]));
    expect(new Set(ids(await search('laptop asus 16 gb')))).toEqual(new Set([15, 16]));
    expect(ids(await search('laptop 16gb'))).toContain(18);
  });

  it('diacritics never matter: "mașină de spălat" = "masina de spalat", "consolă" = "consola"', async () => {
    expect(ids(await search('mașină de spălat'))).toEqual([25]);
    expect(ids(await search('masina de spalat'))).toEqual([25]);
    expect(new Set(ids(await search('consolă')))).toEqual(new Set([11, 12, 13, 14]));
  });

  it('model numbers are exact: "rtx 5070" is not "rtx 5060"', async () => {
    expect(ids(await search('rtx 5070'))).toEqual([19]);
    expect(ids(await search('rtx 5060'))).toEqual([16]);
  });

  it('"iphone 17 pro 256": the 256 GB Pro first, never the 512 GB one', async () => {
    const r = await search('iphone 17 pro 256');
    expect(r.hits[0]!.id).toBe(20);
    expect(ids(r)).not.toContain(23);
  });

  it('colours work in Romanian and English', async () => {
    expect(ids(await search('iphone negru'))).toEqual([22]);
    expect(new Set(ids(await search('frigider black')))).toEqual(new Set([7, 8]));
  });

  it('a barcode takes the direct path', async () => {
    const r = await search(GTIN_24);
    expect(r.gtin).not.toBeNull();
    expect(ids(r)).toEqual([24]);
  });

  it('no result: "tigaie" (not in the catalogue) returns nothing, even after relaxing', async () => {
    const r = await search('tigaie');
    expect(r.total).toBe(0);
  });

  it('relaxed matching when no product has every word', async () => {
    const r = await search('televizor samsung cuptor');
    expect(r.matching).toBe('last');
    expect(r.total).toBeGreaterThan(0);
  });

  it('facets: disjunctive brands, categories, stock and price bounds', async () => {
    const r = await search('televizor', { marca: 'samsung' });
    expect(new Set(ids(r))).toEqual(new Set([1, 2, 3, 6]));
    const brands = Object.fromEntries(r.facets.brands.map((b) => [b.value, b.count]));
    expect(brands).toMatchObject({ samsung: 4, lg: 1, philips: 1, tcl: 1 });
    expect(r.facets.inStock).toBe(4);
    expect(r.facets.price).toEqual({ min: 1599, max: 7499 });
    const inStock = await search('televizor', { stoc: '1' });
    expect(ids(inStock)).not.toContain(26);
    const cheap = await search('televizor', { pret_max: '2.500' });
    expect(new Set(ids(cheap))).toEqual(new Set([1, 5, 6]));
  });

  it('sorts by price and lists a category by popularity then price', async () => {
    expect(ids(await search('televizor', { ordine: 'pret-asc' })).slice(0, 2)).toEqual([6, 1]);
    const list = await listProducts(meili, names, { filter: ['category_slugs = "televizoare"'], facets: ['brand_slug'] });
    expect(list.total).toBe(7);
    expect(list.hits.slice(0, 3).map((h) => h.id)).toEqual([6, 1, 5]);
    expect(list.hits.at(-1)!.id).toBe(26); // no price: last
    expect(list.facets.brand_slug?.samsung).toBe(4);
  });
});

describe.skipIf(!reachable)('database → index sync', () => {
  let t: TestDatabase;
  const deps = () => ({ db: t.db, meili, names });
  let productIds: number[] = [];

  async function addProduct(title: string, brandSlug: string, category: string, lei: number, shop: string, ext: string): Promise<number> {
    const p = await t.db.execute<{ id: string }>(sql`
      INSERT INTO products (slug, title, title_ascii, brand_id, category_id)
      VALUES (${`${ext}-tmp`}, ${title}, ${title.toLowerCase()}, (SELECT id FROM brands WHERE slug = ${brandSlug}), (SELECT id FROM categories WHERE slug = ${category}))
      RETURNING id::text`);
    const id = Number(p.rows[0]!.id);
    await t.db.execute(sql`UPDATE products SET slug = ${`${ext}-${id}`} WHERE id = ${id}`);
    const shopId = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = ${shop}`);
    const bani = Math.round(lei * 100);
    await recordObservation(t.db, {
      shopId: Number(shopId.rows[0]!.id), sourceId: null, sourceTier: 1, runId: null, externalId: ext, url: `https://example.ro/${ext}`, titleRaw: title,
      priceBani: bani, totalBani: bani, availability: 'in_stock', condition: 'new', contentHash: createHash('sha256').update(`${ext}${bani}`).digest('hex'),
      observedAt: new Date(Date.now() - 3_600_000),
    });
    await t.db.execute(sql`UPDATE offers SET product_id = ${id}, match_status = 'auto' WHERE external_id = ${ext}`);
    return id;
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    await seedDev(t.db);
    await syncTaxonomy(t.db);
    await t.db.execute(sql`INSERT INTO brands (name, slug) VALUES ('Samsung', 'samsung'), ('Sony', 'sony')`);
    productIds = [
      await addProduct('Televizor Samsung 55U8072H, 138 cm, Smart, 4K', 'samsung', 'televizoare', 2299.99, 'emag', 'tv-1'),
      await addProduct('Consola Sony PlayStation 5 Slim, 1TB', 'sony', 'console', 2449, 'emag', 'ps-1'),
    ];
  });
  afterAll(async () => {
    await dropAll();
    await t?.drop();
  });

  it('a first sync without a watermark rebuilds everything', async () => {
    const r = await syncChanged(deps());
    expect(r.mode).toBe('full');
    expect(r.indexed).toBe(2);
    const meta = await readMeta(meili, names);
    expect(meta).toMatchObject({ id: 'products', generation: 1, documents: 2 });
    const hit = (await search('televizor samsung')).hits[0]!;
    expect(hit).toMatchObject({ id: productIds[0], min_total_bani: 229_999, min_shop: 'eMAG', in_stock: true, offer_count: 1, indexable: false });
    const s = await suggest(meili, names, 'telev');
    expect(s.products.map((p) => p.id)).toContain(productIds[0]);
    expect(s.categories.map((c) => c.slug)).toContain('televizoare');
  });

  it('a renamed product is searchable under its new title after the next sync', async () => {
    await t.db.execute(sql`UPDATE products SET title = 'Televizor Samsung Crystal Vision 55U8072H', updated_at = now() WHERE id = ${productIds[0]!}`);
    const r = await syncChanged(deps());
    // The 2-minute overlap re-indexes the other fresh product too: harmless and idempotent.
    expect(r).toMatchObject({ mode: 'incremental', removed: 0 });
    expect(r.indexed).toBeGreaterThanOrEqual(1);
    expect(ids(await search('crystal vision'))).toEqual([productIds[0]]);
  });

  it('a price change on an offer refreshes the document', async () => {
    await t.db.execute(sql`UPDATE offers SET price = 2099, total_price = 2099, updated_at = now() WHERE external_id = 'tv-1'`);
    await syncChanged(deps());
    expect((await search('crystal vision')).hits[0]!.min_total_bani).toBe(209_900);
  });

  it('a hidden product leaves the index; an explicit re-index brings it back when active again', async () => {
    await t.db.execute(sql`UPDATE products SET status = 'hidden', updated_at = now() WHERE id = ${productIds[1]!}`);
    expect(await syncChanged(deps())).toMatchObject({ removed: 1 });
    expect((await search('playstation')).total).toBe(0);
    await t.db.execute(sql`UPDATE products SET status = 'active' WHERE id = ${productIds[1]!}`);
    expect(await indexProductIds(deps(), [productIds[1]!])).toEqual({ indexed: 1, removed: 0 });
    expect(ids(await search('playstation'))).toEqual([productIds[1]]);
  });

  it('an offer that goes past its shop freshness SLO leaves the live offers at the next sync', async () => {
    // No row changes: only time passes (the offer was last checked just over the SLO ago).
    await t.db.execute(sql`
      UPDATE offers o SET last_checked_at = now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26)) - interval '30 seconds'
      FROM shops s WHERE s.id = o.shop_id AND o.external_id = 'tv-1'`);
    await syncChanged(deps());
    expect((await search('crystal vision')).hits[0]).toMatchObject({ offer_count: 0, min_total_bani: null, in_stock: false });
    // Checked again by the recorder (which bumps updated_at): live again.
    await t.db.execute(sql`UPDATE offers SET last_checked_at = now(), updated_at = now() WHERE external_id = 'tv-1'`);
    await syncChanged(deps());
    expect((await search('crystal vision')).hits[0]).toMatchObject({ offer_count: 1, min_total_bani: 209_900 });
  });

  it('a shop that is paused (no product or offer row changes) drops out of its products at the next sync', async () => {
    await t.db.execute(sql`UPDATE shops SET status = 'paused' WHERE slug = 'emag'`);
    await syncChanged(deps());
    expect((await search('crystal vision')).hits[0]).toMatchObject({ offer_count: 0, min_total_bani: null });
    expect((await search('crystal vision', { magazin: 'emag' })).total).toBe(0);
    await t.db.execute(sql`UPDATE shops SET status = 'active' WHERE slug = 'emag'`);
    await syncChanged(deps());
    expect((await search('crystal vision')).hits[0]).toMatchObject({ offer_count: 1, min_total_bani: 209_900 });
    expect(ids(await search('crystal vision', { magazin: 'emag' }))).toEqual([productIds[0]]);
  });

  it('a sync is skipped while another writer holds the index lock, and catches up afterwards', async () => {
    await t.db.execute(sql`UPDATE offers SET price = 1999, total_price = 1999, updated_at = now() WHERE external_id = 'tv-1'`);
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pretoscop.search:${names.products}`}))`);
      expect(await syncChanged(deps())).toEqual({ mode: 'skipped', indexed: 0, removed: 0 });
    });
    expect((await search('crystal vision')).hits[0]!.min_total_bani).toBe(209_900);
    expect((await syncChanged(deps())).mode).toBe('incremental');
    expect((await search('crystal vision')).hits[0]!.min_total_bani).toBe(199_900);
  });

  it('a full rebuild bumps the generation and keeps every active product', async () => {
    const r = await rebuildAll(deps());
    expect(r.documents).toBe(2);
    expect((await readMeta(meili, names))?.generation).toBe(2);
  });
});
