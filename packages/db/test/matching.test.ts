import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decideManually,
  matchOffer,
  mergeProducts,
  pendingOffers,
  recordObservation,
  seedDev,
  syncTaxonomy,
  undoMerge,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let emag: number;
let dedeman: number;
let n = 0;

function obs(shopId: number, externalId: string, title: string, extra: Partial<OfferObservation> = {}): OfferObservation {
  const priceBani = extra.priceBani ?? 100_000;
  return {
    shopId,
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
    contentHash: createHash('sha256').update(String(priceBani)).digest('hex'),
    observedAt: new Date(Date.now() - 3600_000 + n++ * 1000),
    ...extra,
  };
}

async function matchAllPending() {
  const out = [];
  for (const o of await pendingOffers(t.db, 100)) out.push(await matchOffer(t.db, o));
  return out;
}

async function productOf(externalId: string): Promise<number | null> {
  const r = await t.db.execute<{ product_id: string | null }>(sql`SELECT product_id::text FROM offers WHERE external_id = ${externalId}`);
  return r.rows[0]?.product_id ? Number(r.rows[0].product_id) : null;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  await syncTaxonomy(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  emag = Number(r.rows.find((x) => x.slug === 'emag')!.id);
  dedeman = Number(r.rows.find((x) => x.slug === 'dedeman')!.id);
  // Dedeman plays a trust-tier-2 shop here (titles alone must not create products).
  await t.db.execute(sql`UPDATE shops SET trust_tier = 2 WHERE id = ${dedeman}`);
});
afterAll(async () => t?.drop());

describe('matching v1', () => {
  it('creates a product from brand + MPN, then attaches other sellers and a regional MPN variant', async () => {
    const title = 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry';
    const attrs = { storageGb: 128, ramGb: 8, color: 'blue' };
    await recordObservation(t.db, obs(emag, 'E1', title, { brandName: 'Samsung', mpnNorm: 'SMS741BZVDEUE', attributes: attrs }));
    await recordObservation(t.db, obs(emag, 'E2', title, { brandName: 'Samsung', mpnNorm: 'SMS741BZVDEUE', attributes: attrs, sellerType: 'marketplace' }));
    await recordObservation(t.db, obs(dedeman, 'D1', 'Smartphone Samsung Galaxy S26 FE 128GB 8GB Blueberry', { brandName: 'Samsung', mpnNorm: 'SMS741BZVD', attributes: attrs }));
    const out = await matchAllPending();
    expect(out.map((o) => o.decision)).toEqual(['new_product', 'accept', 'accept']);
    const p = await productOf('E1');
    expect(await productOf('E2')).toBe(p);
    expect(await productOf('D1')).toBe(p);
    const prod = await t.db.execute<{ slug: string; category: string; provisional: boolean; family: string | null }>(
      sql`SELECT p.slug, c.slug AS category, p.provisional, f.title AS family FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_families f ON f.id = p.family_id WHERE p.id = ${p}`,
    );
    expect(prod.rows[0]).toMatchObject({ category: 'telefoane-mobile', provisional: false, family: 'Samsung Galaxy S26 FE' });
    expect(prod.rows[0]!.slug).toMatch(/^telefon-mobil-samsung-galaxy-s26-fe-.*-\d+$/);
  });

  it('a storage variant is a different product in the same family', async () => {
    await recordObservation(t.db, obs(emag, 'E3', 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 256GB, 5G, Blueberry', { brandName: 'Samsung', mpnNorm: 'SMS741BZVHEUE', attributes: { storageGb: 256, ramGb: 8, color: 'blue' } }));
    const [o] = await matchAllPending();
    expect(o?.decision).toBe('new_product');
    const fam = await t.db.execute<{ n: string }>(sql`SELECT count(DISTINCT family_id)::text AS n FROM products WHERE id IN (SELECT product_id FROM offers WHERE external_id IN ('E1','E3'))`);
    expect(fam.rows[0]!.n).toBe('1');
    expect(await productOf('E3')).not.toBe(await productOf('E1'));
  });

  it('accessories, bundles and refurbished offers stay unmatched; untrusted titles without identifiers too', async () => {
    await recordObservation(t.db, obs(emag, 'A1', 'Husa de protectie pentru Samsung Galaxy S26 FE, Silicon', { brandName: 'Samsung', isAccessory: true }));
    await recordObservation(t.db, obs(emag, 'B1', 'Consola PlayStation 5 Slim + joc EA FC 26', { brandName: 'Sony', isBundle: true, mpnNorm: 'CFI2016' }));
    await recordObservation(t.db, obs(dedeman, 'U1', 'Aspirator vertical Rowenta X-Force Flex 9.60', { brandName: 'Rowenta' }));
    const out = await matchAllPending();
    expect(out.map((o) => [o.decision, o.reasons[0]])).toEqual([
      ['unmatched', 'accessory'],
      ['unmatched', 'bundle'],
      ['unmatched', 'no candidate and no identifier'],
    ]);
  });

  it('re-running changes nothing (no pending offers left)', async () => {
    const before = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM match_decisions`);
    expect(await matchAllPending()).toEqual([]);
    const after = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM match_decisions`);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('a human decision becomes a sticky alias that survives re-matching', async () => {
    const target = (await productOf('E3'))!;
    const u1 = (await t.db.execute<{ id: string }>(sql`SELECT id::text FROM offers WHERE external_id = 'U1'`)).rows[0]!.id;
    await decideManually(t.db, Number(u1), { kind: 'accept', productId: target }, 'human:test');
    // Identity change → pending again → the alias wins over every rule.
    await t.db.execute(sql`UPDATE offers SET match_status = 'pending', matched_at = NULL WHERE id = ${Number(u1)}`);
    const [o] = await matchAllPending();
    expect(o).toMatchObject({ decision: 'accept', productId: target, reasons: ['sticky alias'] });
  });

  it('merges keep history and can be undone', async () => {
    const a = (await productOf('E1'))!;
    const b = (await productOf('E3'))!;
    const moved = await mergeProducts(t.db, b, a, 'human:test');
    expect(moved).toBeGreaterThanOrEqual(1);
    expect(await productOf('E3')).toBe(a);
    const back = await undoMerge(t.db, b, 'human:test');
    expect(back).toBe(moved);
    expect(await productOf('E3')).toBe(b);
  });
});
