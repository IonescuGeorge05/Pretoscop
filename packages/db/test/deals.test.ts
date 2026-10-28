import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDaysIso, bucharestToday, getDeals, productPriceFacts, syncTaxonomy } from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
const today = bucharestToday();
const ids: Record<string, number> = {};

/** A product with a synthetic daily series: [[fromDaysAgo, toDaysAgo, lei], …] and today's best total. */
async function product(key: string, category: string, runs: Array<[number, number, number]>, currentLei: number, opts: { provisional?: boolean } = {}) {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, category_id, provisional)
    VALUES (${key}, ${`Produs ${key}`}, ${`produs ${key}`}, (SELECT id FROM categories WHERE slug = ${category}), ${opts.provisional ?? false})
    RETURNING id::text`);
  const id = Number(r.rows[0]!.id);
  let days = 0;
  for (const [from, to, lei] of runs) {
    for (let n = from; n >= to; n--) {
      await t.db.execute(sql`INSERT INTO product_daily (product_id, day, min_price, min_total_price, offer_count, in_stock_count)
        VALUES (${id}, ${addDaysIso(today, -n)}::date, ${lei.toFixed(2)}, ${lei.toFixed(2)}, 1, 1)`);
      days++;
    }
  }
  await t.db.execute(sql`INSERT INTO product_stats (product_id, current_min_total, observations_days, verdict)
    VALUES (${id}, ${currentLei.toFixed(2)}, ${days}, 'usual')`);
  ids[key] = id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await syncTaxonomy(t.db);
  await product('drop-console', 'console', [[45, 5, 2000], [4, 0, 1700]], 1700);
  await product('old-drop-tv', 'televizoare', [[50, 12, 3000], [11, 0, 2700]], 2700);
  await product('short-history', 'console', [[9, 1, 2000], [0, 0, 1500]], 1500);
  await product('provisional-drop', 'console', [[45, 5, 2000], [4, 0, 1500]], 1500, { provisional: true });
  await product('flat-phone', 'telefoane-mobile', [[60, 0, 999]], 999);
  await product('dip-phone', 'telefoane-mobile', [[29, 10, 1000], [9, 1, 960], [0, 0, 950]], 950);
});
afterAll(async () => {
  await t?.drop();
});

describe('getDeals (M15)', () => {
  it('lists verified drops of the last 7 days, biggest first, with all-time lows flagged', async () => {
    const d = await getDeals(t.db, { windowDays: 7 }, today);
    expect(d.drops.map((x) => x.id)).toEqual([ids['drop-console']]);
    const c = d.drops[0]!;
    expect(c.drop).toMatchObject({ referenceBani: 200_000, since: addDaysIso(today, -4) });
    expect(c.drop!.pct).toBeCloseTo(0.15);
    expect(c.allTimeLow).toMatchObject({ previousLowBani: 200_000 });
    expect(c).toMatchObject({ categorySlug: 'console', rootSlug: 'gaming', currentBani: 170_000 });
    expect(d.eligibleProducts).toBe(5);
    expect(d.historyStartedAt).toBe(addDaysIso(today, -60));
  });

  it('keeps provisional products and short histories out; never shows a flat price', async () => {
    const all = await getDeals(t.db, { windowDays: 30 }, today);
    const listed = [...all.drops, ...all.lows30].map((x) => x.id);
    expect(listed).not.toContain(ids['provisional-drop']);
    expect(listed).not.toContain(ids['short-history']);
    expect(listed).not.toContain(ids['flat-phone']);
    expect(all.drops.map((x) => x.id)).toEqual([ids['drop-console'], ids['old-drop-tv']]);
    // 1.000 → 960 → 950 lei: today’s level (950) is only 1% under the 30-day minimum (960): a 30-day low, not a drop.
    expect(all.lows30.map((x) => x.id)).toEqual([ids['dip-phone']]);
  });

  it('puts older drops and 30-day lows in the second list', async () => {
    const d = await getDeals(t.db, { windowDays: 7 }, today);
    expect(d.lows30.map((x) => x.id)).toEqual(expect.arrayContaining([ids['old-drop-tv'], ids['dip-phone']]));
    expect(d.lows30.map((x) => x.id)).not.toContain(ids['drop-console']);
  });

  it('filters by category: a root includes its leaves', async () => {
    expect((await getDeals(t.db, { windowDays: 30, category: 'gaming' }, today)).drops.map((x) => x.id)).toEqual([ids['drop-console']]);
    expect((await getDeals(t.db, { windowDays: 30, category: 'televizoare' }, today)).drops.map((x) => x.id)).toEqual([ids['old-drop-tv']]);
    expect((await getDeals(t.db, { windowDays: 30, category: 'frigidere' }, today)).drops).toEqual([]);
  });

  it('productPriceFacts gives the product page the same answer', async () => {
    const f = await productPriceFacts(t.db, ids['drop-console']!, today);
    expect(f.drop?.since).toBe(addDaysIso(today, -4));
    expect((await productPriceFacts(t.db, ids['short-history']!, today)).drop).toBeNull();
    expect((await productPriceFacts(t.db, 999_999, today)).currentBani).toBeNull();
  });
});
