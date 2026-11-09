import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeProductsOf, emagProductCode, extDailyLows, extResolutionReport, resolveExtLookup, shopUrlParts } from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
const shop: Record<string, number> = {};
const prod: Record<string, number> = {};
let n = 0;

async function product(key: string, o: { brand?: number | null; mpn?: string | null; mpnSource?: string; status?: string } = {}): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, brand_id, mpn, mpn_norm, mpn_source, status)
    VALUES (${`p-${key}`}, ${`Produs ${key}`}, ${`produs ${key}`}, ${o.brand ?? null}, ${o.mpn ?? null},
      ${o.mpn ? o.mpn.toUpperCase().replace(/[^A-Z0-9]/g, '') : null}, ${o.mpnSource ?? null}, ${o.status ?? 'active'})
    RETURNING id::text`);
  prod[key] = Number(r.rows[0]!.id);
  return prod[key];
}

async function offer(shopKey: string, url: string, o: { product?: number | null; status?: string; gtin14?: string | null; gtinRaw?: string | null; mpn?: string | null; mpnSource?: string; brand?: string | null; blacklisted?: boolean; active?: boolean } = {}): Promise<void> {
  n++;
  const productId = o.product ?? null;
  await t.db.execute(sql`
    INSERT INTO offers (shop_id, external_id, url, title_raw, price, total_price, first_seen_at, last_seen_at, last_checked_at, price_changed_at,
      content_hash, product_id, match_status, gtin14, gtin_raw, mpn_raw, mpn_norm, mpn_source, brand_raw, blacklisted, active, availability)
    VALUES (${shop[shopKey]!}, ${`x${n}`}, ${url}, 'Produs', 100, 100, now(), now(), now(), now(), 'h', ${productId},
      ${o.status ?? (productId ? 'auto' : 'unmatched')}, ${o.gtin14 ?? null}, ${o.gtinRaw ?? null}, ${o.mpn ?? null},
      ${o.mpn ? o.mpn.toUpperCase().replace(/[^A-Z0-9]/g, '') : null}, ${o.mpnSource ?? null}, ${o.brand ?? null}, ${o.blacklisted ?? false}, ${o.active ?? true}, 'in_stock')`);
}

beforeAll(async () => {
  t = await createTestDatabase();
  for (const [slug, domain] of [['emag', 'emag.ro'], ['itgalaxy', 'itgalaxy.ro'], ['altex', 'altex.ro']] as const) {
    const r = await t.db.execute<{ id: string }>(sql`
      INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier)
      VALUES (${slug}, ${slug}, ${domain}, ${`https://www.${domain}`}, 'retail', 'active', 'direct', 2) RETURNING id::text`);
    shop[slug] = Number(r.rows[0]!.id);
  }
  const brand = async (name: string, slug: string, aliases: string[] = []) =>
    Number((await t.db.execute<{ id: string }>(sql`INSERT INTO brands (name, slug, aliases) VALUES (${name}, ${slug}, ${sql.param(aliases)}::text[]) RETURNING id::text`)).rows[0]!.id);
  const samsung = await brand('Samsung', 'samsung');
  const testoscop = await brand('Testoscop', 'testoscop', ['TSC Electronics']);

  // URL: eMAG by product code (two offers of one product: shop and marketplace), other shops by host + path.
  await product('phone', { brand: samsung, mpn: 'SM-S741BZVDEUE', mpnSource: 'field' });
  await offer('emag', 'https://www.emag.ro/telefon-samsung-s26-fe/pd/DF1MLR2BM/', { product: prod.phone });
  await offer('emag', 'https://www.emag.ro/telefon-samsung-s26-fe-albastru/pd/DF1MLR2BM/?X-Search-Id=1', { product: prod.phone, status: 'manual' });
  await product('laptop');
  await offer('itgalaxy', 'https://www.itgalaxy.ro/laptop/Laptop-ABC-123/', { product: prod.laptop });
  // Two products behind one eMAG code: ambiguous.
  await product('amb-a');
  await product('amb-b');
  await offer('emag', 'https://www.emag.ro/a/pd/DAMBIG01/', { product: prod['amb-a'] });
  await offer('emag', 'https://www.emag.ro/b/pd/DAMBIG01/', { product: prod['amb-b'] });
  // Offers that must not count: pending, rejected, blacklisted, unmatched.
  await product('ignored');
  await offer('emag', 'https://www.emag.ro/p/pd/DPENDING1/', { product: prod.ignored, status: 'pending' });
  await offer('emag', 'https://www.emag.ro/p/pd/DREJECT01/', { product: prod.ignored, status: 'rejected' });
  await offer('emag', 'https://www.emag.ro/p/pd/DBLACK001/', { product: prod.ignored, blacklisted: true });
  await offer('emag', 'https://www.emag.ro/p/pd/DNOPROD01/');

  // Merges and hidden products.
  await product('target');
  const merged = await product('merged', { status: 'merged' });
  await t.db.execute(sql`UPDATE products SET merged_into_id = ${prod.target!} WHERE id = ${merged}`);
  await offer('emag', 'https://www.emag.ro/x/pd/DMERGED01/', { product: merged });
  await product('hidden', { status: 'hidden' });
  await offer('emag', 'https://www.emag.ro/x/pd/DHIDDEN01/', { product: prod.hidden });

  // GTIN: product_gtins first, then matched offers.
  await product('tv');
  await t.db.execute(sql`INSERT INTO product_gtins (gtin14, product_id, source) VALUES ('04006381333931', ${prod.tv!}, 'feed')`);
  await product('fridge');
  await offer('itgalaxy', 'https://www.itgalaxy.ro/frigider/F1/', { product: prod.fridge, gtin14: '08710000001236' });
  await product('gtin-a');
  await product('gtin-b');
  await offer('itgalaxy', 'https://www.itgalaxy.ro/g/A/', { product: prod['gtin-a'], gtin14: '05940000000011' });
  await offer('altex', 'https://altex.ro/g/B/cpd/B1/', { product: prod['gtin-b'], gtin14: '05940000000011' });

  // Brand + part number: on products (stated beats guessed), then on matched offers.
  await product('watch', { brand: testoscop, mpn: 'TW-100', mpnSource: 'field' });
  await product('watch-guess', { brand: testoscop, mpn: 'TW 100', mpnSource: 'title' });
  await product('speaker');
  await offer('itgalaxy', 'https://www.itgalaxy.ro/boxa/S1/', { product: prod.speaker, mpn: 'SPK-9', mpnSource: 'field' });
  await t.db.execute(sql`UPDATE products SET brand_id = ${testoscop} WHERE id = ${prod.speaker!}`);

  // Daily lows: two observed days with a gap between them.
  await t.db.execute(sql`INSERT INTO product_daily (product_id, day, min_price, min_total_price, offer_count, in_stock_count) VALUES
    (${prod.phone!}, '2026-10-01', 2199.99, 2199.99, 1, 1), (${prod.phone!}, '2026-10-03', 2149.00, 2168.99, 2, 2)`);
});

afterAll(async () => {
  await t?.drop();
});

describe('shopUrlParts / emagProductCode', () => {
  it('drops scheme, www, query, fragment and trailing slashes', () => {
    expect(shopUrlParts('https://www.eMAG.ro/telefon/pd/DF1MLR2BM/?ref=x#y')).toEqual({ domain: 'emag.ro', path: '/telefon/pd/DF1MLR2BM' });
    expect(shopUrlParts('http://altex.ro/')).toEqual({ domain: 'altex.ro', path: '/' });
    expect(shopUrlParts('javascript:alert(1)')).toBeNull();
    expect(shopUrlParts('not a url')).toBeNull();
  });
  it('reads eMAG product codes', () => {
    expect(emagProductCode('/telefon-x/pd/DF1MLR2BM')).toBe('DF1MLR2BM');
    expect(emagProductCode('/telefoane-mobile/c')).toBeNull();
    expect(emagProductCode('/x/pd/df1mlr2bm/')).toBeNull();
  });
});

describe('resolveExtLookup (M26)', () => {
  it('finds an eMAG page by its product code, whatever the slug or query', async () => {
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/alt-slug/pd/DF1MLR2BM/' })).toEqual({ productId: prod.phone, matchedBy: 'url' });
    expect(await resolveExtLookup(t.db, { url: 'https://emag.ro/telefon/pd/DF1MLR2BM' })).toEqual({ productId: prod.phone, matchedBy: 'url' });
  });

  it('finds other shops by host and path (www, case, trailing slash and query ignored)', async () => {
    expect(await resolveExtLookup(t.db, { url: 'http://itgalaxy.ro/laptop/laptop-abc-123?utm=1' })).toEqual({ productId: prod.laptop, matchedBy: 'url' });
    expect(await resolveExtLookup(t.db, { url: 'https://www.itgalaxy.ro/laptop/Laptop-ABC-1234/' })).toBeNull();
    expect(await resolveExtLookup(t.db, { url: 'https://www.example.ro/laptop/Laptop-ABC-123/' })).toBeNull();
  });

  it('refuses to guess between two products', async () => {
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/a/pd/DAMBIG01/' })).toBeNull();
    expect(await resolveExtLookup(t.db, { gtin: '594-0000-0000-11' })).toBeNull();
  });

  it('ignores pending, rejected, blacklisted and unmatched offers', async () => {
    for (const code of ['DPENDING1', 'DREJECT01', 'DBLACK001', 'DNOPROD01']) {
      expect(await resolveExtLookup(t.db, { url: `https://www.emag.ro/p/pd/${code}/` })).toBeNull();
    }
  });

  it('follows merges and never answers with a hidden product', async () => {
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/x/pd/DMERGED01/' })).toEqual({ productId: prod.target, matchedBy: 'url' });
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/x/pd/DHIDDEN01/' })).toBeNull();
  });

  it('resolves GTINs from product_gtins, then from matched offers; invalid codes resolve nothing', async () => {
    expect(await resolveExtLookup(t.db, { gtin: '4006381333931' })).toEqual({ productId: prod.tv, matchedBy: 'gtin' });
    expect(await resolveExtLookup(t.db, { gtin: '8710000001236' })).toEqual({ productId: prod.fridge, matchedBy: 'gtin' });
    expect(await resolveExtLookup(t.db, { gtin: '4006381333932' })).toBeNull();
    expect(await resolveExtLookup(t.db, { gtin: '0000000000000' })).toBeNull();
  });

  it('resolves brand + part number; a stated part number beats a guessed one; the brand must match', async () => {
    expect(await resolveExtLookup(t.db, { brand: 'SAMSUNG', mpn: 'sm-s741bzvdeue' })).toEqual({ productId: prod.phone, matchedBy: 'brand_mpn' });
    expect(await resolveExtLookup(t.db, { brand: 'Testoscop', mpn: 'TW100' })).toEqual({ productId: prod.watch, matchedBy: 'brand_mpn' });
    expect(await resolveExtLookup(t.db, { brand: 'TSC Electronics', mpn: 'TW-100' })).toEqual({ productId: prod.watch, matchedBy: 'brand_mpn' });
    expect(await resolveExtLookup(t.db, { brand: 'Testoscop', mpn: 'SPK 9' })).toEqual({ productId: prod.speaker, matchedBy: 'brand_mpn' });
    expect(await resolveExtLookup(t.db, { brand: 'Apple', mpn: 'SM-S741BZVDEUE' })).toBeNull();
    expect(await resolveExtLookup(t.db, { brand: 'Samsung', mpn: 'NA' })).toBeNull();
  });

  it('tries the most specific identifier first and falls back to the next', async () => {
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/x/pd/DF1MLR2BM/', gtin: '4006381333931' })).toEqual({ productId: prod.phone, matchedBy: 'url' });
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/x/pd/DUNKNOWN1/', gtin: '4006381333931' })).toEqual({ productId: prod.tv, matchedBy: 'gtin' });
    expect(await resolveExtLookup(t.db, { url: 'https://www.emag.ro/x/pd/DUNKNOWN1/', gtin: '4006381333932', brand: 'Samsung', mpn: 'SM-S741BZVDEUE' })).toEqual({
      productId: prod.phone,
      matchedBy: 'brand_mpn',
    });
    expect(await resolveExtLookup(t.db, {})).toBeNull();
  });
});

describe('activeProductsOf', () => {
  it('ends chains at active products and gives up on long chains', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 7; i++) ids.push(await product(`chain-${i}`, { status: i === 6 ? 'active' : 'merged' }));
    for (let i = 0; i < 6; i++) await t.db.execute(sql`UPDATE products SET merged_into_id = ${ids[i + 1]!} WHERE id = ${ids[i]!}`);
    expect(await activeProductsOf(t.db, [ids[1]!])).toEqual([ids[6]]);
    expect(await activeProductsOf(t.db, [ids[0]!])).toEqual([]);
    expect(await activeProductsOf(t.db, [prod.tv!, prod.tv!, prod.hidden!])).toEqual([prod.tv]);
  });
});

describe('extDailyLows', () => {
  it('returns observed days as numeric text, gaps absent', async () => {
    expect(await extDailyLows(t.db, prod.phone!, '2026-09-30', '2026-10-05')).toEqual([
      ['2026-10-01', '2199.99'],
      ['2026-10-03', '2168.99'],
    ]);
    expect(await extDailyLows(t.db, prod.phone!, '2026-10-02', '2026-10-02')).toEqual([]);
  });
});

describe('extResolutionReport', () => {
  it('counts the eMAG offers the lookup resolves and checks they resolve to their own product', async () => {
    const r = await extResolutionReport(t.db, 'emag');
    // 2 phone + 2 ambiguous + 4 ignored + merged + hidden = 10 active eMAG offers; phone ×2 and merged resolve.
    expect(r).toMatchObject({ shop: 'emag', offers: 10, resolved: 3, byMethod: { url: 3, gtin: 0, brand_mpn: 0 }, sameProduct: 3, otherProduct: 0, unmatchedOffer: 0 });
    expect(r.identifiersOnly).toBe(0);
    expect((await extResolutionReport(t.db, 'nu-exista')).offers).toBe(0);
  });
});
