import { formatLei } from '@pretoscop/core';

/** Romanian money and time formatting for messages (same rules as the site: `1.234,56 lei`). */
export function lei(bani: number): string {
  return formatLei(bani);
}

/** numeric(12,2) string → bani (string arithmetic, never floats). */
export function toBani(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Math.round(value * 100);
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const bani = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -bani : bani;
}

const dateTime = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Bucharest',
});
const longDate = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' });

/** "6 nov. 2026, 12:00" in Romania time. */
export function formatDateTime(d: Date | string): string {
  return dateTime.format(new Date(d));
}

/** "6 noiembrie 2026" in Romania time. */
export function formatLongDate(d: Date | string): string {
  return longDate.format(new Date(d));
}

/** Whole-percent drop from `reference` to `total` (at least 1 when there is a drop). */
export function dropPercent(totalBani: number, referenceBani: number): number {
  if (referenceBani <= 0 || totalBani >= referenceBani) return 0;
  return Math.max(1, Math.floor(((referenceBani - totalBani) * 100) / referenceBani));
}

/** Delivery wording of the product page (offers table). */
export function deliveryLine(priceBani: number, shippingBani: number | null, shippingEstimated = false): string {
  if (shippingBani === null) return `${lei(priceBani)} + livrare de verificat pe site-ul magazinului`;
  if (shippingBani === 0) return `${lei(priceBani)}, livrare gratuită`;
  return `${lei(priceBani)} + ${lei(shippingBani)} livrare${shippingEstimated ? ' (estimată)' : ''}`;
}

export function shorten(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
