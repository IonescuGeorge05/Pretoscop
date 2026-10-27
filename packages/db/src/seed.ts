import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { ensureKnownFlags } from './queries/flags';
import { shops } from './schema/shops';

/**
 * Minimal development seed: two shops and the known feature flags (all off). Idempotent.
 * The full shop registry is synced from packages/config/shops/*.yaml by `make shops:sync` (M04).
 */
export async function seedDev(db: Db): Promise<{ shops: number }> {
  const rows = [
    {
      slug: 'emag',
      name: 'eMAG',
      domain: 'emag.ro',
      websiteUrl: 'https://www.emag.ro',
      kind: 'marketplace_host' as const,
      status: 'active' as const,
      accessMode: 'direct' as const,
      trustTier: 1,
      legalBasisRef: 'ADR-013; founder decision 2026-10-27 (option A)',
      shippingRules: { free_over: 200, flat: 19.99, notes: 'estimare; de verificat' },
    },
    {
      slug: 'dedeman',
      name: 'Dedeman',
      domain: 'dedeman.ro',
      websiteUrl: 'https://www.dedeman.ro',
      kind: 'retail' as const,
      status: 'active' as const,
      accessMode: 'direct' as const,
      trustTier: 1,
      shippingRules: { notes: 'estimare; de verificat' },
    },
  ];
  for (const r of rows) {
    await db
      .insert(shops)
      .values(r)
      .onConflictDoUpdate({ target: shops.slug, set: { name: r.name, updatedAt: sql`now()` } });
  }
  await ensureKnownFlags(db);
  return { shops: rows.length };
}
