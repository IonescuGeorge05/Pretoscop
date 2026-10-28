import type { IcecatCoverageRow } from '@pretoscop/db';

/** Brands whose datasheets Open Icecat serves free (research, 2026-10-27; docs/05 M11 target ≥ 60%). */
export const OPEN_ICECAT_FREE_BRANDS = ['samsung', 'lg', 'lenovo', 'dell', 'philips', 'kingston'];
/** Brands that answered "Full Icecat only" (403, app_key). */
export const FULL_ICECAT_BRANDS = ['sony', 'xiaomi', 'logitech', 'amd'];

/** The `icecat:coverage` table, one line per brand. */
export function coverageTable(rows: IcecatCoverageRow[]): string[] {
  const pct = (a: number, b: number) => (b === 0 ? '-' : `${Math.round((100 * a) / b)}%`);
  const out = [
    `${'brand'.padEnd(18)} ${'products'.padStart(8)} ${'specs'.padStart(6)} ${'cover'.padStart(5)} ${'missing'.padStart(7)} ${'restr.'.padStart(6)} ${'full'.padStart(5)} ${'untried'.padStart(7)}  note`,
  ];
  for (const r of rows) {
    const b = r.brand.toLowerCase();
    const note = OPEN_ICECAT_FREE_BRANDS.includes(b)
      ? `Open Icecat brand: 60% target ${r.withSpecs / Math.max(1, r.products) >= 0.6 ? 'met' : 'not met'}`
      : FULL_ICECAT_BRANDS.includes(b)
        ? 'needs Full Icecat'
        : b === 'apple'
          ? 'restricted (authorised resellers only)'
          : '';
    out.push(
      `${r.brand.slice(0, 18).padEnd(18)} ${String(r.products).padStart(8)} ${String(r.withSpecs).padStart(6)} ${pct(r.withSpecs, r.products).padStart(5)} ${String(r.notFound).padStart(7)} ${String(r.restricted).padStart(6)} ${String(r.fullOnly).padStart(5)} ${String(r.notTried).padStart(7)}  ${note}`,
    );
  }
  return out;
}
