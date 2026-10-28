import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDaysIso,
  bucharestToday,
  computeProductStats,
  getHistory,
  offerBaselines,
  recordObservation,
  recordWithGuard,
  releaseQuarantine,
  rollupProducts,
  seedDev,
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
  const r = await t.db.execute<{ id: string }>(
    sql`INSERT INTO products (slug, title, title_ascii) VALUES (${slug}, ${slug}, ${slug}) RETURNING id::text`,
  );
  return Number(r.rows[0]!.id);
}

function obs(shopId: number, externalId: string, observedAt: Date, lei: number, extra: Partial<OfferObservation> = {}): OfferObservation {
  const priceBani = Math.round(lei * 100);
  const availability = extra.availability ?? 'in_stock';
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
    contentHash: createHash('sha256').update(`${priceBani}|${availability}`).digest('hex'),
    observedAt,
    ...extra,
  };
}

async function link(externalId: string, productId: number) {
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'auto' WHERE external_id = ${externalId}`);
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  dedeman = Number(r.rows.find((x) => x.slug === 'dedeman')!.id);
  emag = Number(r.rows.find((x) => x.slug === 'emag')!.id);
});
afterAll(async () => t?.drop());

describe('rollup_product_daily (known answers)', () => {
  it('100 → 90 → 95 with an outage: daily minima, intraday drop, gap left empty, marketplace separate', async () => {
    const p = await product('p1');
    // Offer A at a shop: 7 days ago 100, 6 days ago confirmed, 5 days ago 90 then 95 the same day,
    // 4 days ago confirmed; then the crawler was down; today 95 again (gap recorded).
    await recordObservation(t.db, obs(dedeman, 'A', at(-7), 100));
    await recordObservation(t.db, obs(dedeman, 'A', at(-6), 100));
    await recordObservation(t.db, obs(dedeman, 'A', at(-5, 8), 90));
    await recordObservation(t.db, obs(dedeman, 'A', at(-5, 14), 95));
    await recordObservation(t.db, obs(dedeman, 'A', at(-4), 95));
    await recordObservation(t.db, obs(dedeman, 'A', at(0), 95));
    // Offer B: a marketplace seller, cheaper, only 7 days ago.
    await recordObservation(t.db, obs(emag, 'B', at(-7), 80, { sellerType: 'marketplace' }));
    await link('A', p);
    await link('B', p);

    await rollupProducts(t.db, { productIds: [p], from: day(-7), to: day(0) });
    const rows = await t.db.execute<{ day: string; min_total: string | null; mp: string | null; offer_count: number }>(
      sql`SELECT day::text, min_total_price::text AS min_total, mp_min_total_price::text AS mp, offer_count FROM product_daily WHERE product_id = ${p} ORDER BY day`,
    );
    expect(rows.rows.map((r) => [r.day, r.min_total, r.mp])).toEqual([
      [day(-7), '100.00', '80.00'],
      [day(-6), '100.00', null],
      [day(-5), '90.00', null],
      [day(-4), '95.00', null],
      [day(0), '95.00', null],
    ]);
  });

  it('out-of-stock days count the offer but set no minimum', async () => {
    const p = await product('p2');
    await recordObservation(t.db, obs(dedeman, 'C', at(-2), 50));
    await recordObservation(t.db, obs(dedeman, 'C', at(-1), 50, { availability: 'out_of_stock' }));
    await link('C', p);
    await rollupProducts(t.db, { productIds: [p], from: day(-2), to: day(-1) });
    const rows = await t.db.execute<{ day: string; min_total: string | null; offer_count: number; in_stock_count: number }>(
      sql`SELECT day::text, min_total_price::text AS min_total, offer_count, in_stock_count FROM product_daily WHERE product_id = ${p} ORDER BY day`,
    );
    // Day -1 carries in-stock 50 from before the day and then goes out of stock: still a valid minimum.
    expect(rows.rows[0]).toMatchObject({ min_total: '50.00', in_stock_count: 1 });
    expect(rows.rows[1]).toMatchObject({ min_total: '50.00', offer_count: 1 });
  });
});

describe('product stats, verdicts and history', () => {
  it('insufficient data under 14 days; current and minima from our observations', async () => {
    const p1 = Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM products WHERE slug = 'p1'`)).rows[0]!.id);
    await computeProductStats(t.db, [p1]);
    const s = await t.db.execute<Record<string, unknown>>(sql`SELECT current_min_total::text, min_30d::text, observations_days, verdict FROM product_stats WHERE product_id = ${p1}`);
    expect(s.rows[0]).toEqual({ current_min_total: '95.00', min_30d: '90.00', observations_days: 5, verdict: 'insufficient_data' });
    const prod = await t.db.execute<Record<string, unknown>>(sql`SELECT offer_count, min_total_price::text FROM products WHERE id = ${p1}`);
    expect(prod.rows[0]).toEqual({ offer_count: 1, min_total_price: '95.00' });
  });

  it('good price after 20 days at 1,000 lei and a drop to 900 lei today', async () => {
    const p = await product('p3');
    for (let i = -20; i <= -1; i++) await recordObservation(t.db, obs(dedeman, 'D', at(i), 1000));
    await recordObservation(t.db, obs(dedeman, 'D', at(0), 900));
    await link('D', p);
    await rollupProducts(t.db, { productIds: [p], from: day(-20), to: day(0) });
    await computeProductStats(t.db, [p]);
    const s = await t.db.execute<Record<string, unknown>>(sql`SELECT verdict, observations_days, min_30d::text, median_90d::text FROM product_stats WHERE product_id = ${p}`);
    expect(s.rows[0]).toEqual({ verdict: 'good_price', observations_days: 21, min_30d: '900.00', median_90d: '1000.00' });

    const h = await getHistory(t.db, p, '30d');
    expect(h.series.min).toHaveLength(21);
    expect(h.series.min.at(-1)).toEqual([day(0), 900]);
    expect(h.series.shops.dedeman).toHaveLength(21);
    expect(h.stats).toMatchObject({ verdict: 'good_price', current: 900, observationsDays: 21 });
  });

  it('a provisional product stops being provisional at two live offers, and stays so (M07 rule)', async () => {
    const p = await product('p-provisional');
    await t.db.execute(sql`UPDATE products SET provisional = true WHERE id = ${p}`);
    const provisional = async () =>
      (await t.db.execute<{ provisional: boolean }>(sql`SELECT provisional FROM products WHERE id = ${p}`)).rows[0]!.provisional;

    await recordObservation(t.db, obs(dedeman, 'P1', at(0), 120));
    await link('P1', p);
    await computeProductStats(t.db, [p]);
    expect(await provisional()).toBe(true); // one offer: still provisional

    await recordObservation(t.db, obs(emag, 'P2', at(0), 118));
    await link('P2', p);
    await computeProductStats(t.db, [p]);
    expect(await provisional()).toBe(false); // a second live offer corroborates the product

    await t.db.execute(sql`UPDATE offers SET active = false WHERE external_id = 'P2'`);
    await computeProductStats(t.db, [p]);
    expect(await provisional()).toBe(false); // never goes back
  });
});

describe('anomaly guard', () => {
  it('quarantines a ×100 jump, publishes it only when a second observation agrees', async () => {
    await recordObservation(t.db, obs(dedeman, 'Q', at(-3), 1000));
    const base1 = (await offerBaselines(t.db, dedeman, ['Q'])).get('Q');
    const g1 = await recordWithGuard(t.db, obs(dedeman, 'Q', at(-2), 10), base1);
    expect(g1).toMatchObject({ action: 'quarantined' });
    // Back to normal: the held glitch is rejected, the normal price is recorded.
    const g2 = await recordWithGuard(t.db, obs(dedeman, 'Q', at(-1, 6), 1000), (await offerBaselines(t.db, dedeman, ['Q'])).get('Q'));
    expect(g2.action).toBe('recorded');
    // A real ×3.5 move seen twice is published.
    const g3 = await recordWithGuard(t.db, obs(dedeman, 'Q', at(-1, 10), 3500), (await offerBaselines(t.db, dedeman, ['Q'])).get('Q'));
    expect(g3.action).toBe('quarantined');
    const g4 = await recordWithGuard(t.db, obs(dedeman, 'Q', at(0), 3510), (await offerBaselines(t.db, dedeman, ['Q'])).get('Q'));
    expect(g4).toMatchObject({ action: 'recorded' });
    const statuses = await t.db.execute<{ status: string }>(sql`SELECT status FROM price_events_quarantine ORDER BY id`);
    expect(statuses.rows.map((r) => r.status)).toEqual(['rejected', 'confirmed']);
    const ev = await t.db.execute<{ price: string }>(sql`SELECT pe.price::text AS price FROM price_events pe JOIN offers o ON o.id = pe.offer_id WHERE o.external_id = 'Q' ORDER BY pe.observed_at`);
    expect(ev.rows.map((r) => r.price)).toEqual(['1000.00', '3500.00', '3510.00']);
  });

  it('an admin can release a held observation', async () => {
    await recordObservation(t.db, obs(dedeman, 'R', at(-2), 500));
    const g = await recordWithGuard(t.db, obs(dedeman, 'R', at(-1), 2000), (await offerBaselines(t.db, dedeman, ['R'])).get('R'));
    expect(g.action).toBe('quarantined');
    const r = await releaseQuarantine(t.db, (g as { quarantineId: number }).quarantineId, 'human:test');
    expect(r?.eventKind).toBe('change');
  });
});
