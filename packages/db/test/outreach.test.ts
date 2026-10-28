import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assistedMigrationStatus, outreach, sql } from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.execute(sql`
    INSERT INTO shops (slug, name, domain, website_url, status, access_mode, legal_basis_ref) VALUES
      ('asistat-a', 'Asistat A', 'asistat-a.ro', 'https://www.asistat-a.ro', 'active', 'assisted', 'infra/legal/opinie-2026-10.pdf'),
      ('asistat-b', 'Asistat B', 'asistat-b.ro', 'https://www.asistat-b.ro', 'active', 'assisted', 'infra/legal/opinie-2026-10.pdf'),
      ('direct', 'Direct', 'direct.ro', 'https://www.direct.ro', 'active', 'direct', null)`);
  // A: 4 assisted requests in 30 days (3 usable), one older than 30 days, one direct one (ignored).
  await t.db.execute(sql`
    INSERT INTO request_log (ts, host, url, shop_slug, channel, status, blocked, attempt, error_code) VALUES
      (now() - interval '1 day', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/1', 'asistat-a', 'assisted', 200, false, 1, null),
      (now() - interval '2 days', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/2', 'asistat-a', 'assisted', 304, false, 1, null),
      (now() - interval '3 days', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/3', 'asistat-a', 'assisted', 200, false, 1, null),
      (now() - interval '4 days', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/4', 'asistat-a', 'assisted', 403, true, 1, null),
      (now() - interval '40 days', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/5', 'asistat-a', 'assisted', 403, true, 1, null),
      (now() - interval '1 day', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/6', 'asistat-a', 'direct', 403, true, 1, null),
      (now() - interval '1 day', 'www.asistat-a.ro', 'https://www.asistat-a.ro/c/7', 'asistat-a', 'assisted', 0, false, 0, null)`);
  // A's vendor costs: two days this month, one day last month (not counted).
  await t.db.execute(sql`
    INSERT INTO access_costs (day, shop_id, vendor, requests, successes, cost_cents)
    SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest'))::date, id, 'zyte', 100, 95, 12 FROM shops WHERE slug = 'asistat-a'
    UNION ALL SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest'))::date, id, 'oxylabs', 10, 9, 30 FROM shops WHERE slug = 'asistat-a'
    UNION ALL SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest') - interval '1 day')::date, id, 'zyte', 100, 95, 500 FROM shops WHERE slug = 'asistat-a'`);
  // B already has its replacement: a merchant feed that ran yesterday, and an agreement.
  await t.db.execute(sql`
    INSERT INTO shop_sources (shop_id, key, kind, url, parser_key, enabled, kill_switch, last_success_at)
    SELECT id, 'asistat-b:feed:merchant', 'feed', 'https://www.asistat-b.ro/feed.xml', 'feed-google-shopping', true, false, now() - interval '1 day'
      FROM shops WHERE slug = 'asistat-b'`);
  const [b] = (await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'asistat-b'`)).rows;
  await t.db.insert(outreach).values([
    { shopId: Number(b!.id), purpose: 'feed', channel: 'email', status: 'sent', createdBy: 'human:test', createdAt: new Date('2026-10-01T10:00:00Z') },
    { shopId: Number(b!.id), purpose: 'feed', channel: 'email', status: 'agreed', createdBy: 'human:test', createdAt: new Date('2026-10-20T10:00:00Z') },
  ]);
}, 180_000);

afterAll(async () => {
  await t?.drop();
}, 120_000);

describe('assistedMigrationStatus', () => {
  it('lists only assisted shops, with their 30-day success rate, a live replacement feed and the latest outreach', async () => {
    const rows = await assistedMigrationStatus(t.db);
    expect(rows.map((r) => r.slug)).toEqual(['asistat-a', 'asistat-b']);
    expect(rows[0]).toMatchObject({ requests30d: 4, successRate30d: 0.75, costMonthCents: 42, feedLive: false, outreachStatus: null, legalBasisRef: 'infra/legal/opinie-2026-10.pdf' });
    expect(rows[1]).toMatchObject({ requests30d: 0, successRate30d: null, costMonthCents: 0, feedLive: true, outreachStatus: 'agreed' });
    expect(rows[1]!.outreachAt?.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });
});
