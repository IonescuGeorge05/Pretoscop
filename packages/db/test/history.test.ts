/**
 * History integrity (review fixes of 9–10 Nov 2026): history is built only from what we observed,
 * stays right after mapping changes, and the discount facts read the real start of a price level.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDaysIso,
  bucharestToday,
  decideManually,
  gapThresholdHoursFor,
  getHistory,
  llmGrayZoneOffers,
  matchOffer,
  mergeProducts,
  offerHistoryDays,
  pendingOffers,
  productOfferFacts,
  rebuildDirtyHistory,
  recordObservation,
  rollupProducts,
  seedDev,
  sendPriceOutliersToMatcher,
  splitProduct,
  undoMerge,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let dedeman: number;
let emag: number;
const today = bucharestToday();
const day = (n: number) => addDaysIso(today, n); // n ≤ 0
const at = (n: number, hourUtc = 8) => new Date(`${day(n)}T${String(hourUtc).padStart(2, '0')}:00:00Z`);

async function product(slug: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`INSERT INTO products (slug, title, title_ascii) VALUES (${slug}, ${slug}, ${slug}) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

function obs(shopId: number, externalId: string, observedAt: Date, lei: number, extra: Partial<OfferObservation> = {}): OfferObservation {
  const priceBani = Math.round(lei * 100);
  const availability = extra.availability ?? 'in_stock';
  const oldPriceBani = extra.oldPriceBani ?? null;
  return {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId,
    url: `https://example.ro/${externalId}`,
    titleRaw: externalId,
    priceBani,
    totalBani: priceBani,
    availability,
    condition: 'new',
    sellerType: 'shop',
    contentHash: createHash('sha256').update(`${priceBani}|${oldPriceBani}|${availability}`).digest('hex'),
    observedAt,
    ...extra,
  };
}

async function link(externalId: string, productId: number) {
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE external_id = ${externalId}`);
}

async function offerId(externalId: string): Promise<number> {
  return Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM offers WHERE external_id = ${externalId}`)).rows[0]!.id);
}

async function daily(productId: number): Promise<Array<[string, string | null]>> {
  const r = await t.db.execute<{ day: string; min_total: string | null }>(
    sql`SELECT day::text, min_total_price::text AS min_total FROM product_daily WHERE product_id = ${productId} ORDER BY day`,
  );
  return r.rows.map((x) => [x.day, x.min_total]);
}

/** Drains product_history_dirty the way the rollup.history job does. */
async function drain(): Promise<number[]> {
  const all: number[] = [];
  for (;;) {
    const r = await rebuildDirtyHistory(t.db, { limit: 100 });
    if (r.products.length === 0) return all;
    all.push(...r.products);
  }
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  dedeman = Number(r.rows.find((x) => x.slug === 'dedeman')!.id);
  emag = Number(r.rows.find((x) => x.slug === 'emag')!.id);
});
afterAll(async () => t?.drop());

describe('the day a coverage gap ends', () => {
  it('a price that rose while we were not looking starts at the observed price, not the pre-gap one', async () => {
    const p = await product('gap-rise');
    await recordObservation(t.db, obs(dedeman, 'G1', at(-6), 80));
    await recordObservation(t.db, obs(dedeman, 'G1', at(-5), 80));
    // No check for four days, then 100: a gap from day -5 to day -1, and a change event at its end.
    await recordObservation(t.db, obs(dedeman, 'G1', at(-1), 100));
    await recordObservation(t.db, obs(dedeman, 'G1', at(0), 100));
    await link('G1', p);
    await rollupProducts(t.db, { productIds: [p], from: day(-6), to: day(0) });
    // Day -1 used to read 80 (carried in from before the gap, never observed on that day).
    expect(await daily(p)).toEqual([
      [day(-6), '80.00'],
      [day(-5), '80.00'],
      [day(-1), '100.00'],
      [day(0), '100.00'],
    ]);
    const h = await getHistory(t.db, p, '30d');
    expect(h.series.shops.dedeman).toEqual([[day(-6), 80], [day(-5), 80], [day(-1), 100], [day(0), 100]]);
    const days = await offerHistoryDays(t.db, await offerId('G1'), day(-6), day(0));
    expect(days.map((d) => [d.day, d.priceBani])).toEqual([[day(-6), 8000], [day(-5), 8000], [day(-1), 10000], [day(0), 10000]]);
  });

  it('a price confirmed by the check that ends the gap counts from that check on', async () => {
    const p = await product('gap-same');
    await recordObservation(t.db, obs(dedeman, 'G2', at(-6), 70));
    await recordObservation(t.db, obs(dedeman, 'G2', at(-1), 70)); // same content: no event, the carried state is observed again
    await link('G2', p);
    await rollupProducts(t.db, { productIds: [p], from: day(-6), to: day(-1) });
    expect(await daily(p)).toEqual([
      [day(-6), '70.00'],
      [day(-1), '70.00'],
    ]);
  });
});

describe('gap threshold per source', () => {
  it('is 1.5 × the freshness SLO, never under 36 h', () => {
    expect(gapThresholdHoursFor(26)).toBe(39);
    expect(gapThresholdHoursFor(12)).toBe(36);
    expect(gapThresholdHoursFor(192)).toBe(288);
    expect(gapThresholdHoursFor(null)).toBe(36);
  });

  it('one missed night of a nightly source is a gap (the 48 h threshold let minutes decide)', async () => {
    await recordObservation(t.db, obs(dedeman, 'G3', new Date(`${day(-3)}T23:10:00Z`), 50));
    // Next check 47 h 50 min later: under the old 48 h threshold this was a filled-in step.
    const r = await recordObservation(t.db, obs(dedeman, 'G3', new Date(`${day(-1)}T23:00:00Z`), 50), { gapThresholdHours: gapThresholdHoursFor(26) });
    expect(r.gap).toBe(true);
    const r2 = await recordObservation(t.db, obs(dedeman, 'G3', new Date(`${day(0)}T21:00:00Z`), 50), { gapThresholdHours: gapThresholdHoursFor(26) });
    expect(r2.gap).toBe(false); // a regular night (22 h)
  });
});

describe('total price on events', () => {
  it('stores the total shown and writes an event when only the total changes (a delivery rule)', async () => {
    const p = await product('total-rule');
    await recordObservation(t.db, obs(dedeman, 'T1', at(-2), 100));
    // Same price, same content hash, but a delivery rule now adds 15 lei.
    const r = await recordObservation(t.db, obs(dedeman, 'T1', at(-1), 100, { totalBani: 11500 }));
    expect(r.changed).toBe(false);
    expect(r.eventKind).toBe('change');
    const ev = await t.db.execute<{ total: string | null }>(sql`SELECT total_price::text AS total FROM price_events WHERE offer_id = ${await offerId('T1')} ORDER BY observed_at`);
    expect(ev.rows.map((e) => e.total)).toEqual(['100.00', '115.00']);
    await recordObservation(t.db, obs(dedeman, 'T1', at(0), 100, { totalBani: 11500 }));
    await link('T1', p);
    await rollupProducts(t.db, { productIds: [p], from: day(-2), to: day(0) });
    // Day -1 still had 100 lei in effect until its 08:00 check; from day 0 on the total is 115.
    expect(await daily(p)).toEqual([
      [day(-2), '100.00'],
      [day(-1), '100.00'],
      [day(0), '115.00'],
    ]);
  });
});

describe('discount facts: the reduction starts with the price level, not with a stock change', () => {
  it('a stock flip after a real reduction does not make the shop reference look unsupported', async () => {
    const p = await product('reduction-flip');
    const ref = { oldPriceBani: 100000 };
    for (let i = -45; i <= -11; i++) await recordObservation(t.db, obs(dedeman, 'R1', at(i), 1000));
    await recordObservation(t.db, obs(dedeman, 'R1', at(-10), 800, ref)); // the reduction, 1.000 lei crossed
    for (let i = -9; i <= -4; i++) await recordObservation(t.db, obs(dedeman, 'R1', at(i), 800, ref));
    await recordObservation(t.db, obs(dedeman, 'R1', at(-3), 800, { ...ref, availability: 'out_of_stock' }));
    await recordObservation(t.db, obs(dedeman, 'R1', at(-2), 800, ref)); // back in stock: price_changed_at moves here
    await recordObservation(t.db, obs(dedeman, 'R1', at(0), 800, ref));
    await link('R1', p);
    const facts = await productOfferFacts(t.db, p);
    // The 30 days before the reduction were at 1.000 lei: the reference is supported. With the
    // stock flip as the "start", the window would hold the reduced price and state the opposite.
    expect(facts.get(await offerId('R1')) ?? []).not.toContainEqual(expect.objectContaining({ kind: 'reference_not_supported' }));
  });

  it('control: the same pattern with an inflated reference is still stated, measured before the real start', async () => {
    const p = await product('reduction-flip-control');
    const ref = { oldPriceBani: 120000 }; // 1.200 lei crossed, never the price in the 30 days before
    for (let i = -45; i <= -11; i++) await recordObservation(t.db, obs(dedeman, 'R2', at(i), 1000));
    for (let i = -10; i <= -4; i++) await recordObservation(t.db, obs(dedeman, 'R2', at(i), 800, ref));
    await recordObservation(t.db, obs(dedeman, 'R2', at(-3), 800, { ...ref, availability: 'out_of_stock' }));
    await recordObservation(t.db, obs(dedeman, 'R2', at(-2), 800, ref));
    await link('R2', p);
    const facts = (await productOfferFacts(t.db, p)).get(await offerId('R2')) ?? [];
    const fact = facts.find((f) => f.kind === 'reference_not_supported');
    expect(fact?.evidence).toMatchObject({ reductionStartedOn: day(-10), lowest30dBefore: 100000 });
  });
});

describe('mapping changes rebuild the whole history (rollup.history)', () => {
  it('a merge brings the moved offer\'s older days into the target', async () => {
    const into = await product('merge-into');
    const from = await product('merge-from');
    for (let i = -10; i <= 0; i++) await recordObservation(t.db, obs(dedeman, 'M1', at(i), 500));
    for (let i = -10; i <= 0; i++) await recordObservation(t.db, obs(emag, 'M2', at(i), 450));
    await link('M1', into);
    await link('M2', from);
    await drain();
    expect((await daily(into))[0]).toEqual([day(-10), '500.00']);

    await mergeProducts(t.db, from, into, 'human:test');
    const marked = await t.db.execute<{ from_day: string }>(sql`SELECT from_day::text FROM product_history_dirty WHERE product_id = ${into}`);
    expect(marked.rows[0]?.from_day).toBe(day(-10));
    await drain();
    // Day -10 now has the cheaper merged offer; before the fix only the last two days did.
    const d = await daily(into);
    expect(d).toHaveLength(11);
    expect(d.every(([, v]) => v === '450.00')).toBe(true);
  });

  it('a split keeps the original product\'s older history and gives the new product its own', async () => {
    const p = await product('split-src');
    for (let i = -10; i <= 0; i++) await recordObservation(t.db, obs(dedeman, 'S1', at(i), 100));
    for (let i = -5; i <= 0; i++) await recordObservation(t.db, obs(emag, 'S2', at(i), 90));
    await link('S1', p);
    await link('S2', p);
    await drain();
    expect((await daily(p)).filter(([, v]) => v === '90.00')).toHaveLength(6);

    const newId = (await splitProduct(t.db, p, [await offerId('S2')], 'human:test'))!;
    await drain();
    const src = await daily(p);
    expect(src).toHaveLength(11); // used to be wiped, then only two days rebuilt
    expect(src.every(([, v]) => v === '100.00')).toBe(true);
    expect(await daily(newId)).toHaveLength(6);
  });

  it('undoing a merge moves its GTINs and sticky aliases back', async () => {
    const into = await product('undo-into');
    const from = await product('undo-from');
    await recordObservation(t.db, obs(emag, 'U2', at(0), 300));
    await link('U2', from);
    await t.db.execute(sql`INSERT INTO product_gtins (gtin14, product_id, source, confidence) VALUES ('05901234123457', ${from}, 'offer', 1)`);
    await t.db.execute(sql`INSERT INTO offer_aliases (shop_id, external_id, product_id, decided_by) VALUES (${emag}, 'U2', ${from}, 'human:test')`);
    await mergeProducts(t.db, from, into, 'human:test');
    expect((await t.db.execute<{ p: string }>(sql`SELECT product_id::text AS p FROM product_gtins WHERE gtin14 = '05901234123457'`)).rows[0]?.p).toBe(String(into));

    await undoMerge(t.db, from, 'human:test');
    expect((await t.db.execute<{ p: string }>(sql`SELECT product_id::text AS p FROM product_gtins WHERE gtin14 = '05901234123457'`)).rows[0]?.p).toBe(String(from));
    expect((await t.db.execute<{ p: string }>(sql`SELECT product_id::text AS p FROM offer_aliases WHERE shop_id = ${emag} AND external_id = 'U2'`)).rows[0]?.p).toBe(String(from));
  });

  it('an event written for an earlier day marks its product for a rebuild from that day', async () => {
    const p = await product('late-event');
    await recordObservation(t.db, obs(dedeman, 'L1', at(-1), 60));
    await link('L1', p);
    await drain();
    await t.db.execute(sql`INSERT INTO price_events (offer_id, observed_at, price, availability, kind) VALUES (${await offerId('L1')}, ${at(-5)}, 55, 'in_stock', 'change')`);
    const marked = await t.db.execute<{ from_day: string }>(sql`SELECT from_day::text FROM product_history_dirty WHERE product_id = ${p}`);
    expect(marked.rows[0]?.from_day).toBe(day(-5));
  });
});

describe('cross-shop price outliers wait for a human', () => {
  it('neither the rules nor the LLM accept a held offer again; a human decision clears the hold', async () => {
    const p = await product('outlier');
    await t.db.execute(sql`INSERT INTO product_gtins (gtin14, product_id, source, confidence) VALUES ('04006381333931', ${p}, 'offer', 1)`);
    await recordObservation(t.db, obs(dedeman, 'O1', at(0), 1000, { gtin14: '04006381333931', brandName: 'Stabilo' }));
    await recordObservation(t.db, obs(emag, 'O2', at(0), 100, { gtin14: '04006381333931', brandName: 'Stabilo' }));
    await link('O1', p);
    await link('O2', p);
    const o2 = await offerId('O2');

    expect(await sendPriceOutliersToMatcher(t.db)).toEqual([o2]);
    const held = await t.db.execute<{ match_status: string; review_hold: string | null }>(sql`SELECT match_status, review_hold FROM offers WHERE id = ${o2}`);
    expect(held.rows[0]).toEqual({ match_status: 'pending', review_hold: 'price below 30% of the cross-shop median' });

    // The rules would accept the same GTIN again at their next pass; the hold keeps it for a human.
    const [pending] = await pendingOffers(t.db, 1, { offerIds: [o2] });
    const out = await matchOffer(t.db, pending!);
    expect(out.decision).toBe('needs_review');
    expect((await t.db.execute<{ match_status: string }>(sql`SELECT match_status FROM offers WHERE id = ${o2}`)).rows[0]?.match_status).toBe('pending');
    expect(await llmGrayZoneOffers(t.db, 10, { offerIds: [o2] })).toEqual([]);

    await decideManually(t.db, o2, { kind: 'accept', productId: p }, 'human:test');
    const after = await t.db.execute<{ match_status: string; review_hold: string | null }>(sql`SELECT match_status, review_hold FROM offers WHERE id = ${o2}`);
    expect(after.rows[0]).toEqual({ match_status: 'manual', review_hold: null });
  });
});
