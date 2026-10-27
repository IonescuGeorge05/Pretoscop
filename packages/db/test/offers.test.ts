import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  emptyStats,
  ensurePriceEventPartitions,
  finishRun,
  insertPriceEventIfChanged,
  listPriceEventPartitions,
  markMissingOffers,
  recordObservation,
  seedDev,
  shopSources,
  startRun,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let shopId: number;
let sourceId: number;

const hash = (o: { priceBani: number; oldPriceBani?: number | null; shippingBani?: number | null; availability: string }) =>
  createHash('sha256')
    .update([o.priceBani, o.oldPriceBani ?? 'null', o.shippingBani ?? 'null', o.availability].join('|'))
    .digest('hex');

function obs(over: Partial<OfferObservation> & { observedAt: Date }): OfferObservation {
  const base = {
    shopId,
    sourceId,
    sourceTier: 1 as const,
    runId: null,
    externalId: 'PD123',
    url: 'https://www.example.ro/p/PD123',
    titleRaw: 'Telefon mobil Samsung Galaxy S25, 256GB, Negru',
    priceBani: 399_999,
    totalBani: 399_999,
    availability: 'in_stock' as const,
    condition: 'new' as const,
    ...over,
  };
  return { ...base, contentHash: over.contentHash ?? hash(base) };
}

async function eventCount(offerId: number): Promise<number> {
  const r = await t.db.execute<{ n: string }>(
    sql`SELECT count(*)::text AS n FROM price_events WHERE offer_id = ${offerId}`,
  );
  return Number(r.rows[0]?.n);
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  const r = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'dedeman'`);
  shopId = Number(r.rows[0]!.id);
  const [src] = await t.db
    .insert(shopSources)
    .values({ shopId, key: 'dedeman:test', kind: 'listing', url: 'https://www.dedeman.ro/x', parserKey: 'test' })
    .returning({ id: shopSources.id });
  sourceId = src!.id;
});

afterAll(async () => {
  await t?.drop();
});

describe('schema v1', () => {
  it('applies migrations on a clean database and seeds two shops', async () => {
    const r = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM shops`);
    expect(Number(r.rows[0]?.n)).toBe(2);
  });

  it('partitions price_events by month, including next month', async () => {
    const parts = await listPriceEventPartitions(t.db);
    const next = new Date();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const name = `price_events_${next.getUTCFullYear()}_${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(parts).toContain(name);
    expect(parts.length).toBeGreaterThanOrEqual(13);
  });

  it('maintenance job creates missing partitions idempotently', async () => {
    await t.db.execute(sql`DROP TABLE price_events_${sql.raw(
      (() => {
        const d = new Date();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + 12);
        return `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      })(),
    )}`);
    expect(await ensurePriceEventPartitions(t.db, 0, 12)).toBe(1);
    expect(await ensurePriceEventPartitions(t.db, 0, 12)).toBe(0);
  });
});

describe('recordObservation', () => {
  const t0 = new Date('2026-10-28T06:00:00Z');

  it('writes a first event, then none for the same observation (idempotent)', async () => {
    const a = await recordObservation(t.db, obs({ observedAt: t0 }));
    expect(a.inserted).toBe(true);
    expect(a.eventKind).toBe('first');
    const b = await recordObservation(t.db, obs({ observedAt: t0 }));
    expect(b.inserted).toBe(false);
    expect(b.eventKind).toBeNull();
    expect(await eventCount(a.offerId!)).toBe(1);
  });

  it('advances last_checked_at without an event when nothing changed', async () => {
    const t1 = new Date('2026-10-29T06:00:00Z');
    const r = await recordObservation(t.db, obs({ observedAt: t1 }));
    expect(r.changed).toBe(false);
    expect(r.eventKind).toBeNull();
    const row = await t.db.execute<{ checked: string; changed: string }>(
      sql`SELECT (extract(epoch FROM last_checked_at) * 1000)::bigint::text AS checked,
                 (extract(epoch FROM price_changed_at) * 1000)::bigint::text AS changed
          FROM offers WHERE id = ${r.offerId}`,
    );
    expect(Number(row.rows[0]!.checked)).toBe(t1.getTime());
    expect(Number(row.rows[0]!.changed)).toBe(t0.getTime());
    expect(await eventCount(r.offerId!)).toBe(1);
  });

  it('writes a change event when the price changes', async () => {
    const t2 = new Date('2026-10-30T06:00:00Z');
    const r = await recordObservation(t.db, obs({ observedAt: t2, priceBani: 379_999, totalBani: 379_999, oldPriceBani: 399_999 }));
    expect(r.changed).toBe(true);
    expect(r.eventKind).toBe('change');
    expect(await eventCount(r.offerId!)).toBe(2);
  });

  it('ignores stale observations (replays never regress the offer)', async () => {
    const r = await recordObservation(t.db, obs({ observedAt: new Date('2026-10-28T12:00:00Z'), priceBani: 1 }));
    expect(r.stale).toBe(true);
  });

  it('records a coverage gap when checks are more than 48 h apart', async () => {
    const t3 = new Date('2026-11-03T06:00:00Z');
    const r = await recordObservation(t.db, obs({ observedAt: t3, priceBani: 379_999, totalBani: 379_999, oldPriceBani: 399_999 }));
    expect(r.gap).toBe(true);
    const g = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM offer_gaps WHERE offer_id = ${r.offerId}`);
    expect(Number(g.rows[0]?.n)).toBe(1);
  });

  it('flags re-matching only when the identity hash changes', async () => {
    const t4 = new Date('2026-11-04T06:00:00Z');
    const a = await recordObservation(t.db, obs({ observedAt: t4, priceBani: 379_999, totalBani: 379_999, oldPriceBani: 399_999, identityHash: 'id-1' }));
    expect(a.needsMatch).toBe(true); // product_id is still null
    await t.db.execute(sql`UPDATE offers SET match_status = 'manual' WHERE id = ${a.offerId}`);
    const b = await recordObservation(t.db, obs({ observedAt: new Date('2026-11-05T06:00:00Z'), priceBani: 379_999, totalBani: 379_999, oldPriceBani: 399_999, identityHash: 'id-2' }));
    const s = await t.db.execute<{ match_status: string }>(sql`SELECT match_status FROM offers WHERE id = ${b.offerId}`);
    expect(s.rows[0]!.match_status).toBe('pending');
  });
});

describe('insertPriceEventIfChanged', () => {
  it('returns changed=false for an identical re-check and true for a change', async () => {
    const first = await recordObservation(
      t.db,
      obs({ externalId: 'PD999', observedAt: new Date('2026-10-28T06:00:00Z') }),
    );
    const same = obs({ externalId: 'PD999', observedAt: new Date('2026-10-28T09:00:00Z') });
    expect(await insertPriceEventIfChanged(t.db, first.offerId!, same)).toEqual({ changed: false, stale: false });
    const cheaper = obs({ externalId: 'PD999', observedAt: new Date('2026-10-28T10:00:00Z'), priceBani: 350_000, totalBani: 350_000 });
    expect(await insertPriceEventIfChanged(t.db, first.offerId!, cheaper)).toEqual({ changed: true, stale: false });
    expect(await eventCount(first.offerId!)).toBe(2);
  });
});

describe('runs and deactivation', () => {
  it('startRun/finishRun write ingest_runs with stats', async () => {
    const run = await startRun(t.db, { sourceId, channel: 'direct' });
    await finishRun(t.db, run.id, { status: 'success', stats: { ...emptyStats(), fetched: 3, parsed: 60 } });
    const r = await t.db.execute<{ status: string; stats: { parsed: number } }>(
      sql`SELECT status, stats FROM ingest_runs WHERE id = ${run.id}`,
    );
    expect(r.rows[0]).toMatchObject({ status: 'success', stats: { parsed: 60 } });
  });

  it('deactivates offers missing from two consecutive full runs, reactivation writes an event', async () => {
    const seen = await recordObservation(t.db, obs({ externalId: 'MISS1', observedAt: new Date('2026-11-10T06:00:00Z') }));
    expect((await markMissingOffers(t.db, sourceId, new Date('2026-11-11T06:00:00Z'))).deactivated).toBe(0);
    const second = await markMissingOffers(t.db, sourceId, new Date('2026-11-12T06:00:00Z'));
    expect(second.deactivated).toBeGreaterThanOrEqual(1);
    const back = await recordObservation(t.db, obs({ externalId: 'MISS1', observedAt: new Date('2026-11-13T06:00:00Z') }));
    expect(back.eventKind).toBe('reactivated');
    expect(await eventCount(seen.offerId!)).toBe(2);
  });
});
