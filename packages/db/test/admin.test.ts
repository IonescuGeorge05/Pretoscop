import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addGtin,
  autoMatchSample,
  matchOffer,
  markOffer,
  pendingOffers,
  productDetail,
  recordObservation,
  removeGtin,
  reviewQueue,
  searchProducts,
  seedDev,
  setOfferBlacklisted,
  setProductStatus,
  splitProduct,
  syncTaxonomy,
  unlinkOffer,
  updateProduct,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let emag: number;
let n = 0;

function obs(externalId: string, title: string, extra: Partial<OfferObservation> = {}): OfferObservation {
  const priceBani = extra.priceBani ?? 250_000;
  return {
    shopId: emag,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId,
    url: `https://x.ro/${externalId}`,
    titleRaw: title,
    titleClean: title,
    priceBani,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    contentHash: createHash('sha256').update(`${externalId}${priceBani}`).digest('hex'),
    observedAt: new Date(Date.now() - 3600_000 + n++ * 1000),
    ...extra,
  };
}

async function matchAll() {
  for (const o of await pendingOffers(t.db, 100)) await matchOffer(t.db, o);
}
async function offerId(ext: string): Promise<number> {
  return Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM offers WHERE external_id = ${ext}`)).rows[0]!.id);
}
async function productOf(ext: string): Promise<number | null> {
  const r = await t.db.execute<{ p: string | null }>(sql`SELECT product_id::text AS p FROM offers WHERE external_id = ${ext}`);
  return r.rows[0]?.p ? Number(r.rows[0].p) : null;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  await syncTaxonomy(t.db);
  emag = Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'emag'`)).rows[0]!.id);
  const attrs = { storageGb: 256, ramGb: 12, color: 'black' };
  await recordObservation(t.db, obs('A1', 'Telefon mobil Samsung Galaxy S26, 12GB RAM, 256GB, 5G, Black', { brandName: 'Samsung', mpnNorm: 'SMS942BZKG', attributes: attrs }));
  await recordObservation(t.db, obs('A2', 'Telefon mobil Samsung Galaxy S26, 12GB RAM, 256GB, 5G, Black', { brandName: 'Samsung', mpnNorm: 'SMS942BZKG', attributes: attrs, sellerType: 'marketplace' }));
  await recordObservation(t.db, obs('B1', 'Laptop Lenovo IdeaPad Slim 3 15IRH10, 16GB, 512GB SSD', { brandName: 'Lenovo', mpnNorm: '83K100ABRM', attributes: { ramGb: 16, storageGb: 512 } }));
  await matchAll();
  // A gray-zone review item, written the way the matcher writes one.
  await recordObservation(t.db, obs('R1', 'Samsung Galaxy S26 5G 256 GB negru', { brandName: 'Samsung', attributes: attrs }));
  const r1 = await offerId('R1');
  const a = (await productOf('A1'))!;
  await t.db.execute(sql`UPDATE offers SET match_status = 'pending', matched_at = now(), match_score = 0.7, match_reason = 'title 0.7 in gray zone' WHERE id = ${r1}`);
  await t.db.execute(sql`INSERT INTO match_candidates (offer_id, product_id, score, features, generator) VALUES (${r1}, ${a}, 0.7, '{"conflicts":[],"via":"title"}'::jsonb, 'title')`);
});
afterAll(async () => t?.drop());

describe('admin queries (M09)', () => {
  it('review queue lists gray-zone offers with their candidates', async () => {
    const q = await reviewQueue(t.db);
    expect(q.total).toBe(1);
    expect(q.items[0]).toMatchObject({ title: 'Samsung Galaxy S26 5G 256 GB negru', score: 0.7 });
    expect(q.items[0]!.candidates[0]).toMatchObject({ productId: await productOf('A1'), score: 0.7, via: 'title' });
  });

  it('finds products by id, MPN and title words', async () => {
    const a = (await productOf('A1'))!;
    expect((await searchProducts(t.db, String(a)))[0]?.id).toBe(a);
    expect((await searchProducts(t.db, 'sms942bzkg'))[0]?.id).toBe(a);
    expect((await searchProducts(t.db, 'ideapad slim'))[0]?.title).toContain('IdeaPad');
  });

  it('edits a product (title renames the slug), GTINs, status', async () => {
    const b = (await productOf('B1'))!;
    const res = await updateProduct(t.db, b, { title: 'Laptop Lenovo IdeaPad Slim 3 15IRH10 (83K100ABRM)', brand: 'Lenovo', categorySlug: 'laptopuri' });
    expect(res?.after).toMatchObject({ title: 'Laptop Lenovo IdeaPad Slim 3 15IRH10 (83K100ABRM)', category: 'laptopuri' });
    expect(String(res?.after.slug)).toMatch(new RegExp(`-${b}$`));
    expect(await addGtin(t.db, b, '00195348765432')).toBe('added');
    expect(await addGtin(t.db, (await productOf('A1'))!, '00195348765432')).toBe('taken');
    expect(await removeGtin(t.db, b, '00195348765432')).toBe(true);
    expect(await setProductStatus(t.db, b, 'hidden')).toBe('active');
    expect((await productDetail(t.db, b))?.status).toBe('hidden');
    await setProductStatus(t.db, b, 'active');
  });

  it('splits offers into a new product with sticky aliases', async () => {
    const a = (await productOf('A1'))!;
    const newId = await splitProduct(t.db, a, [await offerId('A2')], 'human:test');
    expect(newId).not.toBeNull();
    expect(await productOf('A2')).toBe(newId);
    expect(await productOf('A1')).toBe(a);
    const alias = await t.db.execute<{ p: string }>(sql`SELECT product_id::text AS p FROM offer_aliases WHERE external_id = 'A2'`);
    expect(Number(alias.rows[0]!.p)).toBe(newId);
  });

  it('unlinks, blacklists and marks offers', async () => {
    const r1 = await offerId('R1');
    expect(await markOffer(t.db, r1, 'accessory', 'human:test')).toBeNull();
    const flags = await t.db.execute<{ is_accessory: boolean; match_status: string }>(sql`SELECT is_accessory, match_status FROM offers WHERE id = ${r1}`);
    expect(flags.rows[0]).toMatchObject({ is_accessory: true, match_status: 'rejected' });
    expect((await reviewQueue(t.db)).total).toBe(0);

    const a2 = await offerId('A2');
    const before = await productOf('A2');
    expect(await unlinkOffer(t.db, a2, 'human:test')).toBe(before);
    expect(await productOf('A2')).toBeNull();
    const b1Product = await productOf('B1');
    expect(await setOfferBlacklisted(t.db, await offerId('B1'), true)).toBe(b1Product);
    expect(await productOf('B1')).toBeNull();
  });

  it('samples automatic matches for the precision audit', async () => {
    const s = await autoMatchSample(t.db, 5);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.offerTitle && x.productTitle)).toBe(true);
  });
});
