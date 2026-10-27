import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadShops } from '@pretoscop/config/shops';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { syncShops } from '../src/registry/sync';

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe('shops:sync', () => {
  it('inserts the registry, then a second run changes nothing', async () => {
    const registry = loadShops();
    const first = await syncShops(t.db, registry);
    expect(first.shops.inserted).toBe(registry.length);
    expect(first.sources.inserted).toBe(registry.flatMap((s) => s.sources).length);
    const second = await syncShops(t.db, registry);
    expect(second.changes).toEqual([]);
    expect(second.shops).toEqual({ inserted: 0, updated: 0, unchanged: registry.length });
  });

  it('never turns a database kill switch off, disables sources removed from the YAML', async () => {
    await t.db.execute(sql`UPDATE shop_sources SET kill_switch = true WHERE key = 'itgalaxy:sitemap:produse'`);
    const registry = loadShops().map((s) =>
      s.slug === 'emag' ? { ...s, sources: s.sources.filter((x) => x.key !== 'emag:listing:tablete') } : s,
    );
    const r = await syncShops(t.db, registry);
    expect(r.sources.disabled).toBe(1);
    const rows = await t.db.execute<{ key: string; enabled: boolean; kill_switch: boolean }>(
      sql`SELECT key, enabled, kill_switch FROM shop_sources WHERE key IN ('itgalaxy:sitemap:produse','emag:listing:tablete') ORDER BY key`,
    );
    expect(rows.rows).toEqual([
      { key: 'emag:listing:tablete', enabled: false, kill_switch: false },
      { key: 'itgalaxy:sitemap:produse', enabled: true, kill_switch: true },
    ]);
  });

  it('updates changed fields and writes an audit row', async () => {
    const registry = loadShops().map((s) => (s.slug === 'flip' ? { ...s, trust_tier: 3 } : s));
    const r = await syncShops(t.db, registry);
    expect(r.changes).toContain('shop flip: trustTier');
    const a = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM audit_log WHERE action = 'shops.sync'`);
    expect(Number(a.rows[0]?.n)).toBeGreaterThanOrEqual(2);
  });

  it('refuses unknown parser keys', async () => {
    const registry = loadShops().map((s) =>
      s.slug === 'flip' ? { ...s, sources: s.sources.map((x) => ({ ...x, parser_key: 'nope' })) } : s,
    );
    await expect(syncShops(t.db, registry)).rejects.toThrow(/Unknown parser_key: flip:sitemap:produse → nope/);
  });
});
