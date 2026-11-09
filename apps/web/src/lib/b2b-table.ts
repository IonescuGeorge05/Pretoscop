import { B2B_STATUS_LABELS, baniToLeiString, toCsv, type CsvCell } from '@pretoscop/core';
import type { B2bOffer, B2bPositionRow } from '@pretoscop/db';
import { formatDateTime, formatLei } from './format';

/**
 * The B2B position table and its CSV export from one definition (M28 "export matches the UI"):
 * every column has one value per row; the page shows it formatted for Romanian readers, the CSV
 * writes the same value in machine form (lei with a dot, ISO times). Pure: no server-only imports.
 */
export type ColumnKind = 'text' | 'lei' | 'pct' | 'int' | 'time';
type Value = string | number | null;

export interface Column<R> {
  key: string;
  label: string;
  kind: ColumnKind;
  value: (row: R) => Value;
}

const pctFmt = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/** The value as the page shows it. */
export function display(kind: ColumnKind, v: Value): string {
  if (v === null || v === '') return '—';
  switch (kind) {
    case 'lei':
      return formatLei(Number(v));
    case 'pct':
      return `${pctFmt.format(Number(v))}%`;
    case 'time':
      return formatDateTime(String(v));
    case 'int':
      return String(v);
    default:
      return String(v);
  }
}

/** The value as the CSV (and `data-value` attributes) hold it. */
export function machine(kind: ColumnKind, v: Value): string | null {
  if (v === null || v === '') return null;
  switch (kind) {
    case 'lei':
      return baniToLeiString(Number(v));
    case 'pct':
    case 'int':
      return String(v);
    case 'time':
      return new Date(String(v)).toISOString();
    default:
      return String(v);
  }
}

function csvCell(kind: ColumnKind, v: Value): CsvCell {
  const m = machine(kind, v);
  return kind === 'text' || kind === 'time' ? { text: m } : { num: m };
}

const sellerOf = (o: { shopName: string; sellerName: string | null }) => (o.sellerName ? `${o.shopName} (${o.sellerName})` : o.shopName);

/** What the customer named the SKU, else the catalogue title, else the code it gave us. */
export function skuName(r: B2bPositionRow): string {
  return r.label ?? r.product?.title ?? r.gtin ?? r.mpn ?? `SKU ${r.skuId}`;
}

export const SKU_STATUS_LABELS: Record<B2bPositionRow['status'], string> = {
  matched: 'găsit în catalog',
  unmatched: 'negăsit încă',
  ambiguous: 'mai multe produse posibile',
};

export const POSITION_COLUMNS: ReadonlyArray<Column<B2bPositionRow>> = [
  { key: 'ref', label: 'Cod intern', kind: 'text', value: (r) => r.ref },
  { key: 'produs', label: 'Produs', kind: 'text', value: (r) => skuName(r) },
  { key: 'gtin', label: 'GTIN', kind: 'text', value: (r) => r.gtin },
  { key: 'pret_tau', label: 'Prețul tău', kind: 'lei', value: (r) => r.ownTotalBani },
  { key: 'minim', label: 'Minimul concurenței', kind: 'lei', value: (r) => r.position.minBani },
  { key: 'cel_mai_ieftin', label: 'Cel mai ieftin', kind: 'text', value: (r) => (r.cheapest ? sellerOf(r.cheapest) : null) },
  { key: 'mediana', label: 'Mediana', kind: 'lei', value: (r) => r.position.medianBani },
  { key: 'diferenta', label: 'Față de minim', kind: 'pct', value: (r) => r.position.gapToMinPct },
  { key: 'pozitie', label: 'Poziția', kind: 'int', value: (r) => r.position.rank },
  { key: 'concurenti', label: 'Concurenți', kind: 'int', value: (r) => r.position.competitors },
  { key: 'situatie', label: 'Situația', kind: 'text', value: (r) => (r.status === 'matched' ? B2B_STATUS_LABELS[r.position.status] : SKU_STATUS_LABELS[r.status]) },
  { key: 'verificat', label: 'Ultima verificare', kind: 'time', value: (r) => r.newestCheckAt },
];

/** Long format: one line per SKU and competitor offer (the SKU page's table). */
export const OFFER_COLUMNS: ReadonlyArray<Column<{ sku: B2bPositionRow; offer: B2bOffer }>> = [
  { key: 'ref', label: 'Cod intern', kind: 'text', value: (x) => x.sku.ref },
  { key: 'produs', label: 'Produs', kind: 'text', value: (x) => skuName(x.sku) },
  { key: 'magazin', label: 'Magazin', kind: 'text', value: (x) => sellerOf(x.offer) },
  { key: 'pret', label: 'Preț', kind: 'lei', value: (x) => x.offer.priceBani },
  { key: 'livrare', label: 'Livrare', kind: 'lei', value: (x) => x.offer.shippingBani },
  { key: 'total', label: 'Total', kind: 'lei', value: (x) => x.offer.totalBani },
  { key: 'stoc', label: 'Stoc', kind: 'text', value: (x) => AVAILABILITY[x.offer.availability] },
  { key: 'stare', label: 'Stare', kind: 'text', value: (x) => CONDITION[x.offer.condition] },
  { key: 'comparabil', label: 'Intră în minim', kind: 'text', value: (x) => (x.offer.comparable ? 'da' : 'nu') },
  { key: 'verificat', label: 'Verificat', kind: 'time', value: (x) => x.offer.lastCheckedAt },
  { key: 'link', label: 'Link', kind: 'text', value: (x) => x.offer.url },
];

export const AVAILABILITY: Record<B2bOffer['availability'], string> = { in_stock: 'în stoc', out_of_stock: 'stoc epuizat', preorder: 'precomandă', unknown: 'necunoscut' };
export const CONDITION: Record<B2bOffer['condition'], string> = { new: 'nou', refurbished: 'resigilat/recondiționat', used: 'folosit' };

export function tableCsv<R>(columns: ReadonlyArray<Column<R>>, rows: readonly R[]): string {
  return toCsv(
    columns.map((c) => c.label),
    rows.map((r) => columns.map((c) => csvCell(c.kind, c.value(r)))),
  );
}

export function offerRows(rows: readonly B2bPositionRow[]): Array<{ sku: B2bPositionRow; offer: B2bOffer }> {
  return rows.flatMap((sku) => sku.offers.map((offer) => ({ sku, offer })));
}

/** Position-status filter of the table and the export (`?stare=`). */
export const STATUS_FILTERS = {
  peste: { label: 'Peste minim', test: (r: B2bPositionRow) => r.position.status === 'above' },
  cel_mai_ieftin: { label: 'Cel mai mic preț', test: (r: B2bPositionRow) => r.position.status === 'cheapest' || r.position.status === 'tied' },
  fara_pret: { label: 'Fără prețul tău', test: (r: B2bPositionRow) => r.status === 'matched' && r.ownTotalBani === null },
  negasite: { label: 'Negăsite în catalog', test: (r: B2bPositionRow) => r.status !== 'matched' },
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS;

export function filterRows(rows: readonly B2bPositionRow[], stare: string | null | undefined): B2bPositionRow[] {
  const f = stare && stare in STATUS_FILTERS ? STATUS_FILTERS[stare as StatusFilter] : null;
  return f ? rows.filter(f.test) : [...rows];
}
