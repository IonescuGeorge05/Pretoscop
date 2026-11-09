/**
 * Romanian formatting (CLAUDE.md: prices `1.234,56 lei`, dates in Europe/Bucharest).
 * Money arrives either as integer bani or as numeric(12,2) strings from the database.
 */

export const TZ = 'Europe/Bucharest';

const lei2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);
const lei0 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
const pct = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

/** numeric(12,2) string or number of lei → integer bani (string arithmetic for strings). */
export function toBani(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Math.round(value * 100);
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const bani = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -bani : bani;
}

/** 123456 → "1.234,56 lei" (always two decimals: prices are exact). */
export function formatLei(bani: number | null | undefined): string {
  if (bani === null || bani === undefined) return '—';
  return `${lei2.format(bani / 100)} lei`;
}

/** Same as formatLei, but drops ",00" (for compact lists and charts). */
export function formatLeiShort(bani: number | null | undefined): string {
  if (bani === null || bani === undefined) return '—';
  return bani % 100 === 0 ? `${lei0.format(bani / 100)} lei` : formatLei(bani);
}

/** Lei from a numeric(12,2) string. */
export function formatLeiNumeric(value: string | null | undefined): string {
  return formatLei(toBani(value));
}

/** 12.5 → "12,50 €" (operating costs in euro: LLM, vendors). */
export function formatEur(eur: number, digits = 2): string {
  const f = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' } as Intl.NumberFormatOptions);
  return `${f.format(eur)} €`;
}

export function formatPercent(fraction: number): string {
  return `${pct.format(fraction * 100)}%`;
}

const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});
const dayMonthFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: TZ });

/** "27 oct. 2026" */
export function formatDate(d: Date | string | number): string {
  return dateFmt.format(new Date(d));
}

/** "27 oct. 2026, 14:05" */
export function formatDateTime(d: Date | string | number): string {
  return dateTimeFmt.format(new Date(d));
}

/** "27 oct." */
export function formatDayMonth(d: Date | string | number): string {
  return dayMonthFmt.format(new Date(d));
}

const rtf = new Intl.RelativeTimeFormat('ro', { numeric: 'auto' });

/** "acum 3 ore", "ieri", "acum 2 zile" — for "verificat acum N ore". */
export function formatRelative(d: Date | string | number, now: Date = new Date()): string {
  const diffSec = (new Date(d).getTime() - now.getTime()) / 1000;
  const sign = diffSec < 0 ? -1 : 1;
  if (Math.abs(diffSec) < 60) return 'chiar acum';
  const minutes = Math.round(Math.abs(diffSec) / 60);
  if (minutes < 60) return rtf.format(sign * minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(sign * hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(sign * days, 'day');
  return formatDate(d);
}

/**
 * A name inside a sentence: "Telefoane mobile" → "telefoane mobile", while a leading acronym stays
 * as written ("TV și audio", "SSD și hard disk-uri"), and so does the rest ("Laptopuri și PC" →
 * "laptopuri și PC").
 */
export function inSentence(name: string): string {
  const first = name.split(/\s/)[0] ?? '';
  if (first.length > 1 && first === first.toLocaleUpperCase('ro-RO')) return name;
  return name.charAt(0).toLocaleLowerCase('ro-RO') + name.slice(1);
}

/** Romanian plural forms: 1 magazin, 2 magazine, 20 de magazine. */
export function plural(n: number, one: string, few: string, many = `de ${few}`): string {
  if (n === 1) return `1 ${one}`;
  const rem = n % 100;
  if (n === 0 || (rem >= 1 && rem <= 19)) return `${n} ${few}`;
  return `${n} ${many}`;
}
