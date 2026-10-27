import type { Env } from '@pretoscop/config/env';
import { type Db, isFlagEnabled } from '@pretoscop/db';

export interface GateInput {
  shop: { slug: string; status: string; accessMode: string };
  source: { enabled: boolean; killSwitch: boolean };
}

/**
 * Everything that must hold before a request goes to a shop (CLAUDE.md: kill switches and flags
 * for anything that touches a shop). eMAG additionally needs `source.emag.enabled` (ADR-013).
 */
export async function checkGates(db: Db, env: Env, g: GateInput): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!env.CRAWL_ENABLED) return { ok: false, reason: 'env CRAWL_ENABLED is false' };
  if (g.source.killSwitch) return { ok: false, reason: 'source kill switch is on' };
  if (!g.source.enabled) return { ok: false, reason: 'source disabled' };
  if (g.shop.status !== 'active') return { ok: false, reason: `shop status ${g.shop.status}` };
  if (g.shop.accessMode === 'off') return { ok: false, reason: 'shop access_mode off' };
  if (g.shop.accessMode === 'assisted' && !(await isFlagEnabled(db, 'assisted.enabled'))) {
    return { ok: false, reason: 'flag assisted.enabled is off' };
  }
  if (!(await isFlagEnabled(db, 'crawl.enabled'))) return { ok: false, reason: 'flag crawl.enabled is off' };
  if (g.shop.slug === 'emag' && !(await isFlagEnabled(db, 'source.emag.enabled'))) {
    return { ok: false, reason: 'flag source.emag.enabled is off (ADR-013)' };
  }
  return { ok: true };
}
