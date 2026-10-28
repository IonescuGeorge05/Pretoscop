import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyTwoPerformantPrograms,
  invoiceTotals,
  partnerShops,
  programsByShop,
  revenueSummary,
  seedDev,
  upsertCommissions,
  type CommissionInput,
  type TwoPerformantProgram,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
const ids: Record<string, number> = {};

const program = (id: number, url: string, relation: string, pcs: string | null, extra: Partial<TwoPerformantProgram> = {}): TwoPerformantProgram => ({
  id,
  name: url,
  main_url: url,
  unique_code: `u${id}`,
  cookie_life: 30,
  default_sale_commission_rate: '4.5',
  default_sale_commission_type: 'percent',
  affrequest: { status: relation },
  traffic_sources: pcs ? [{ name: 'Price Comparison Services', usage: pcs }] : [],
  ...extra,
});

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  await t.db.execute(sql`INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier) VALUES ('itgalaxy', 'IT Galaxy', 'itgalaxy.ro', 'https://www.itgalaxy.ro', 'retail', 'active', 'direct', 2)`);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  for (const s of r.rows) ids[s.slug] = Number(s.id);
});
afterAll(async () => t?.drop());

describe('2Performant program sync (M24)', () => {
  it('matches programs to shops by domain and maps the comparator permission', async () => {
    const res = await applyTwoPerformantPrograms(
      t.db,
      [
        program(1, 'https://www.itgalaxy.ro', 'accepted', 'yes'),
        program(2, 'https://www.dedeman.ro/', 'pending', 'no'),
        program(3, 'https://www.emag.ro', 'accepted', 'yes'),
        program(4, 'https://unknown-shop.ro', 'accepted', 'yes'),
      ],
      'system:test',
      '2026-10-28',
    );
    expect(res.unmatched).toEqual(['https://unknown-shop.ro (unknown-shop.ro)']);
    expect(res.changes.map((c) => [c.shopSlug, c.after.status, c.after.comparatorPolicy])).toEqual([
      ['itgalaxy', 'approved', 'allowed'],
      ['dedeman', 'pending', 'forbidden'],
      ['emag', 'approved', 'forbidden'],
    ]);
    const p = await programsByShop(t.db);
    expect(p.get(ids.itgalaxy!)).toMatchObject({ network: '2performant', status: 'approved', comparatorPolicy: 'allowed', programExternalId: 'u1', shopDomain: 'itgalaxy.ro' });
    expect(await partnerShops(t.db)).toEqual([{ name: 'IT Galaxy', network: '2performant' }]);
  });

  it('a withdrawn permission flips the program to forbidden, audited; an unchanged sync writes nothing', async () => {
    const again = await applyTwoPerformantPrograms(t.db, [program(1, 'https://www.itgalaxy.ro', 'accepted', 'yes')], 'system:test', '2026-10-28');
    expect(again.changes).toEqual([]);
    const off = await applyTwoPerformantPrograms(t.db, [program(1, 'https://www.itgalaxy.ro', 'accepted', 'no')], 'system:test', '2026-10-28');
    expect(off.changes[0]).toMatchObject({ shopSlug: 'itgalaxy', before: { comparatorPolicy: 'allowed' }, after: { comparatorPolicy: 'forbidden' } });
    const audits = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM audit_log WHERE action = 'affiliate.program_sync' AND entity_id = 'itgalaxy'`);
    expect(audits.rows[0]!.n).toBe('2');
    expect(await partnerShops(t.db)).toEqual([]);
  });
});

describe('commissions and revenue (M24)', () => {
  const c = (id: string, status: CommissionInput['status'], amountBani: number, clickId: number | null, day = '2026-10-20'): CommissionInput => ({
    network: '2performant',
    networkCommissionId: id,
    shopId: ids.itgalaxy!,
    programExternalId: 'u1',
    clickId,
    status,
    amountBani,
    saleAmountBani: amountBani * 20,
    currency: 'RON',
    occurredAt: new Date(`${day}T12:00:00Z`),
    networkUpdatedAt: null,
    raw: { id },
  });

  it('imports idempotently and follows status changes', async () => {
    expect(await upsertCommissions(t.db, [c('A', 'pending', 4500, 1), c('B', 'accepted', 9000, 2), c('C', 'rejected', 1000, null)])).toEqual({ inserted: 3, updated: 0 });
    expect(await upsertCommissions(t.db, [c('A', 'accepted', 4500, null), c('B', 'paid', 9000, 2)])).toEqual({ inserted: 0, updated: 2 });
    const a = await t.db.execute<{ status: string; click_id: string | null }>(sql`SELECT status, click_id::text FROM commissions WHERE network_commission_id = 'A'`);
    expect(a.rows[0]).toEqual({ status: 'accepted', click_id: '1' }); // a later import without the sub-id keeps the click
  });

  it('revenue by shop: EPC and conversion per affiliate click; invoice totals per network and month', async () => {
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      await t.db.execute(sql`INSERT INTO clicks (offer_id, product_id, shop_id, ts, is_affiliate, placement) VALUES (1, 1, ${ids.itgalaxy!}, ${now}, ${i < 3}, 'offers_table')`);
    }
    await upsertCommissions(t.db, [c('D', 'accepted', 3000, 3, now.toISOString().slice(0, 10))]);
    const r = await revenueSummary(t.db, 30);
    const row = r.byShop.find((x) => x.key === 'itgalaxy')!;
    // A, B (paid), C (rejected) of 20 Oct and D of today are all inside the 30 days.
    expect(row).toMatchObject({ clicks: 4, affiliateClicks: 3, commissions: 4, acceptedBani: 16_500, rejectedBani: 1000, epcBani: 5500, conversion: 1.3333 });
    expect(await invoiceTotals(t.db, '2026-10')).toEqual(
      now.toISOString().slice(0, 7) === '2026-10'
        ? [{ network: '2performant', commissions: 4, acceptedBani: 7500, paidBani: 9000, pendingBani: 0 }]
        : [{ network: '2performant', commissions: 3, acceptedBani: 4500, paidBani: 9000, pendingBani: 0 }],
    );
  });
});
