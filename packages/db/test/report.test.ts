import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordObservation, reportOffers, seedDev, type OfferObservation } from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let emag: number;

// Bucharest noon on a given day, as UTC.
const at = (day: string) => new Date(`${day}T10:00:00Z`);

function obs(day: string, priceBani: number, extra: Partial<OfferObservation> = {}): OfferObservation {
  return {
    shopId: emag,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId: 'R1',
    url: 'https://x.ro/R1',
    titleRaw: 'Telefon mobil Test 128GB',
    priceBani,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    contentHash: createHash('sha256').update(`${priceBani}|${extra.oldPriceBani ?? ''}|${extra.availability ?? 'in_stock'}`).digest('hex'),
    observedAt: at(day),
    ...extra,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  emag = Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'emag'`)).rows[0]!.id);
  // Daily checks 1–12 Nov (no gaps): 1000 lei, reference 1200 shown from 10 Nov at 900 lei.
  for (let d = 1; d <= 12; d++) {
    const day = `2026-11-${String(d).padStart(2, '0')}`;
    await recordObservation(t.db, d >= 10 ? obs(day, 90_000, { oldPriceBani: 120_000 }) : obs(day, 100_000));
  }
});
afterAll(async () => t?.drop());

describe('reportOffers (M23 input)', () => {
  it('returns the observed in-stock state per day with the reference price, change-only events carried forward', async () => {
    const offers = await reportOffers(t.db, { from: '2026-11-10', to: '2026-11-12' });
    expect(offers).toHaveLength(1);
    const days = offers[0]!.days;
    expect(days.map((d) => d.day)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`));
    expect(days[0]).toEqual({ day: '2026-11-01', priceBani: 100_000, oldPriceBani: null });
    expect(days[8]).toEqual({ day: '2026-11-09', priceBani: 100_000, oldPriceBani: null });
    expect(days[9]).toEqual({ day: '2026-11-10', priceBani: 90_000, oldPriceBani: 120_000 });
    // Only two events were written (first sight and the change); the rest are carried states.
    const n = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM price_events`);
    expect(n.rows[0]!.n).toBe('2');
  });

  it('skips offers not seen during the window and filters by category', async () => {
    expect(await reportOffers(t.db, { from: '2026-11-20', to: '2026-11-22' })).toEqual([]);
    expect(await reportOffers(t.db, { from: '2026-11-10', to: '2026-11-12', categories: ['laptopuri'] })).toEqual([]);
  });
});
