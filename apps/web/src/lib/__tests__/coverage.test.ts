import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countCoveredShops, coverageSentence, joinNames, listNotYetIncludedShops, notYetIncludedSentence } from '../coverage';

const NOW = new Date('2026-11-05T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let t: TestDatabase;

async function shop(slug: string, name: string, status: string): Promise<number> {
  const r = await t.pool.query<{ id: string }>(
    `INSERT INTO shops (slug, name, domain, website_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [slug, name, `${slug}.ro`, `https://www.${slug}.ro`, status],
  );
  return Number(r.rows[0]!.id);
}

async function offer(shopId: number, externalId: string, checkedAt: Date, extra: { active?: boolean; tier?: number } = {}): Promise<void> {
  await t.pool.query(
    `INSERT INTO offers (shop_id, external_id, url, title_raw, price, total_price, first_seen_at, last_seen_at, last_checked_at, price_changed_at,
                         content_hash, active, source_tier)
     VALUES ($1, $2, $3, 'Produs de test', 100, 100, $4, $4, $4, $4, 'hash', $5, $6)`,
    [shopId, externalId, `https://example.ro/${externalId}`, checkedAt, extra.active ?? true, extra.tier ?? 1],
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
  const fresh = await shop('proaspat', 'Ștef Shop', 'active');
  const second = await shop('sony', 'Sony Store', 'active');
  const third = await shop('tazz', 'Tazz', 'active');
  const stale = await shop('vechi', 'Magazin Vechi', 'active');
  const paused = await shop('pauza', 'Magazin în pauză', 'paused');
  const inactive = await shop('inactiv', 'Oferte inactive', 'active');
  const linkOnly = await shop('link', 'Doar linkuri', 'active');
  await shop('altex', 'Altex', 'blocked');
  await shop('flanco', 'Flanco', 'blocked');
  await shop('cel', 'CEL.ro', 'blocked');

  await offer(fresh, 'a1', hoursAgo(1));
  await offer(fresh, 'a2', hoursAgo(100));
  await offer(second, 'b1', hoursAgo(47));
  await offer(third, 'c1', hoursAgo(2), { tier: 2 });
  await offer(stale, 'd1', hoursAgo(49));
  await offer(paused, 'e1', hoursAgo(1));
  await offer(inactive, 'f1', hoursAgo(1), { active: false });
  await offer(linkOnly, 'g1', hoursAgo(1), { tier: 4 });
}, 60_000);

afterAll(async () => {
  await t?.drop();
});

describe('countCoveredShops', () => {
  it('counts active shops with an active verified offer checked in the last 48 hours, sorted the Romanian way', async () => {
    const covered = await countCoveredShops(t.db, NOW);
    expect(covered.shops).toEqual(['Sony Store', 'Ștef Shop', 'Tazz']);
    expect(covered.count).toBe(3);
    expect(covered.since.toISOString()).toBe('2026-11-03T12:00:00.000Z');
  });

  it('lists the shops not included yet (status blocked)', async () => {
    expect(await listNotYetIncludedShops(t.db)).toEqual(['Altex', 'CEL.ro', 'Flanco']);
  });
});

describe('coverage sentences', () => {
  it('joins names with Romanian conjunctions and plurals', () => {
    expect(joinNames(['eMAG'])).toBe('eMAG');
    expect(joinNames(['eMAG', 'Flip'])).toBe('eMAG și Flip');
    expect(coverageSentence({ count: 1, shops: ['eMAG'] })).toBe('Acoperim în prezent 1 magazin: eMAG.');
    expect(coverageSentence({ count: 3, shops: ['A', 'B', 'C'] })).toBe('Acoperim în prezent 3 magazine: A, B și C.');
    const twenty = Array.from({ length: 20 }, (_, i) => `M${i}`);
    expect(coverageSentence({ count: 20, shops: twenty })).toMatch(/^Acoperim în prezent 20 de magazine: M0, M1, /);
  });

  it('says plainly when nothing is covered, and omits an empty not-yet list', () => {
    expect(coverageSentence({ count: 0, shops: [] })).toBe('Momentan nu avem prețuri verificate în ultimele 48 de ore din niciun magazin.');
    expect(notYetIncludedSentence([])).toBeNull();
    expect(notYetIncludedSentence(['Altex', 'Flanco'])).toBe('Magazine neincluse încă: Altex și Flanco.');
  });
});
