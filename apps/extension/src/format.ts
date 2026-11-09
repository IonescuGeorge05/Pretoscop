/**
 * Romanian formatting for the panel, the same output as the site's `apps/web/src/lib/format.ts`
 * (CLAUDE.md: prices `1.234,56 lei`, dates in Europe/Bucharest). Money stays a decimal string; no
 * floating point.
 */

/** "2249.99" → "2.249,99 lei"; "—" for null. */
export function formatLei(value: string | null): string {
  if (value === null) return '—';
  const m = /^(\d+)\.(\d{2})$/.exec(value);
  if (!m) return '—';
  const int = m[1]!.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${int},${m[2]} lei`;
}

/** "2249.99" → 224999 */
export function toBani(value: string): number {
  const m = /^(\d+)\.(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 100 + Number(m[2]) : NaN;
}

const TZ = 'Europe/Bucharest';
const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const rtf = new Intl.RelativeTimeFormat('ro', { numeric: 'auto' });

/** "2026-10-27" → "27 oct. 2026" */
export function formatDay(day: string): string {
  return dateFmt.format(new Date(`${day}T12:00:00Z`));
}

/** "acum 3 ore", "ieri", "acum 2 zile" (for "verificat …"). */
export function formatRelative(iso: string, now: number): string {
  const diffSec = (Date.parse(iso) - now) / 1000;
  const sign = diffSec < 0 ? -1 : 1;
  if (Math.abs(diffSec) < 60) return 'chiar acum';
  const minutes = Math.round(Math.abs(diffSec) / 60);
  if (minutes < 60) return rtf.format(sign * minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(sign * hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(sign * days, 'day');
  return dateFmt.format(new Date(iso));
}

/** Romanian plural: 1 zi, 2 zile, 20 de zile. */
export function plural(n: number, one: string, few: string): string {
  if (n === 1) return `1 ${one}`;
  const rem = n % 100;
  return n === 0 || (rem >= 1 && rem <= 19) ? `${n} ${few}` : `${n} de ${few}`;
}
