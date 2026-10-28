import { isAssistedDesignated } from '@pretoscop/config';
import type { Env } from '@pretoscop/config/env';
import { type Db, isFlagEnabled, sql } from '@pretoscop/db';

export interface GateInput {
  shop: { slug: string; status: string; accessMode: string };
  source: { enabled: boolean; killSwitch: boolean };
}

/**
 * Everything that must hold before a request goes to a shop (CLAUDE.md: kill switches and flags
 * for anything that touches a shop). eMAG additionally needs `source.emag.enabled` (ADR-013); an
 * assisted shop needs to be designated, the flag `assisted.enabled` and a configured vendor (M05B).
 */
export async function checkGates(db: Db, env: Env, g: GateInput): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!env.CRAWL_ENABLED) return { ok: false, reason: 'env CRAWL_ENABLED is false' };
  if (g.source.killSwitch) return { ok: false, reason: 'source kill switch is on' };
  if (!g.source.enabled) return { ok: false, reason: 'source disabled' };
  if (g.shop.status !== 'active') return { ok: false, reason: `shop status ${g.shop.status}` };
  if (g.shop.accessMode === 'off') return { ok: false, reason: 'shop access_mode off' };
  if (g.shop.accessMode === 'assisted') {
    if (!isAssistedDesignated(g.shop.slug)) return { ok: false, reason: 'shop not designated for assisted access (founder decision needed)' };
    if (env.ASSISTED_VENDOR === 'none') return { ok: false, reason: 'no assisted-access vendor configured (ASSISTED_VENDOR=none)' };
    if (!(await isFlagEnabled(db, 'assisted.enabled'))) return { ok: false, reason: 'flag assisted.enabled is off' };
    // The fetch layer enforces the cap on every request; gating here avoids runs that cannot fetch.
    const capCents = Math.round(env.ASSISTED_MONTHLY_CAP_EUR * 100);
    const spent = await db.execute<{ cents: string }>(sql`
      SELECT coalesce(sum(cost_cents), 0)::text AS cents FROM access_costs
      WHERE day >= date_trunc('month', now() AT TIME ZONE 'Europe/Bucharest')::date`);
    if (Number(spent.rows[0]?.cents ?? 0) >= capCents) return { ok: false, reason: 'assisted-access monthly cap reached (ASSISTED_MONTHLY_CAP_EUR)' };
  }
  if (!(await isFlagEnabled(db, 'crawl.enabled'))) return { ok: false, reason: 'flag crawl.enabled is off' };
  if (g.shop.slug === 'emag' && !(await isFlagEnabled(db, 'source.emag.enabled'))) {
    return { ok: false, reason: 'flag source.emag.enabled is off (ADR-013)' };
  }
  return { ok: true };
}
