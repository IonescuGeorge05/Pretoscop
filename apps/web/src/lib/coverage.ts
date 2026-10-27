import { sql, type Db } from '@pretoscop/db';
import { plural } from './format';

/**
 * Coverage statement for /cum-functioneaza (Commission "Key principles for comparison tools":
 * say which part of the market you cover). A shop counts as covered when it is `active` and at
 * least one of its active, verified offers (source tier 1 crawl/merchant feed or 2 affiliate feed)
 * was checked in the last 48 hours.
 */
export const COVERAGE_WINDOW_HOURS = 48;

export interface CoveredShops {
  count: number;
  /** Shop names, sorted the Romanian way. */
  shops: string[];
  /** Start of the freshness window used for the count. */
  since: Date;
}

const collator = new Intl.Collator('ro', { sensitivity: 'base' });
const byName = (a: string, b: string) => collator.compare(a, b);

async function resolveDb(d?: Db): Promise<Db> {
  if (d) return d;
  // Lazy: keeps this module importable from tests that pass their own database.
  const { db } = await import('./db');
  return db();
}

/** Active shops with at least one offer checked in the last 48 hours, plus their names. */
export async function countCoveredShops(d?: Db, now: Date = new Date()): Promise<CoveredShops> {
  const database = await resolveDb(d);
  const since = new Date(now.getTime() - COVERAGE_WINDOW_HOURS * 3_600_000);
  const res = await database.execute<{ name: string }>(sql`
    SELECT s.name
    FROM shops s
    WHERE s.status = 'active'
      AND EXISTS (
        SELECT 1 FROM offers o
        WHERE o.shop_id = s.id
          AND o.active
          AND o.source_tier <= 2
          AND o.last_checked_at > ${since.toISOString()}::timestamptz
      )`);
  const shops = res.rows.map((r) => r.name).sort(byName);
  return { count: shops.length, shops, since };
}

/** Shops we know about but cannot show yet (`status = 'blocked'` in the registry). */
export async function listNotYetIncludedShops(d?: Db): Promise<string[]> {
  const database = await resolveDb(d);
  const res = await database.execute<{ name: string }>(sql`SELECT name FROM shops WHERE status = 'blocked'`);
  return res.rows.map((r) => r.name).sort(byName);
}

const listFormat = new Intl.ListFormat('ro', { style: 'long', type: 'conjunction' });

/** ["eMAG", "Dedeman", "Flip"] → "eMAG, Dedeman și Flip". */
export function joinNames(names: readonly string[]): string {
  return listFormat.format(names);
}

/** "Acoperim în prezent 20 de magazine: …." or the honest zero sentence. */
export function coverageSentence(covered: Pick<CoveredShops, 'count' | 'shops'>): string {
  if (covered.count === 0) {
    return `Momentan nu avem prețuri verificate în ultimele ${COVERAGE_WINDOW_HOURS} de ore din niciun magazin.`;
  }
  return `Acoperim în prezent ${plural(covered.count, 'magazin', 'magazine')}: ${joinNames(covered.shops)}.`;
}

/** "Magazine neincluse încă: Altex, Flanco și PC Garage." or null when the list is empty. */
export function notYetIncludedSentence(names: readonly string[]): string | null {
  return names.length ? `Magazine neincluse încă: ${joinNames(names)}.` : null;
}
