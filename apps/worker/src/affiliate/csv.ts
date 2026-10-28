import { clickIdFromSub, commissionStatus, moneyToBani } from './twoperformant';

/** RFC 4180 CSV (quotes, doubled quotes, CRLF); the delimiter is detected from the header (`,` or `;`). */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, '');
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();

type Column = 'id' | 'status' | 'amount' | 'sale' | 'currency' | 'program' | 'date' | 'sub';

/** Column names seen in network report exports (English and Romanian); first match wins. */
const COLUMNS: Record<Column, string[]> = {
  id: ['commission id', 'id comision', 'transaction id', 'id tranzactie', 'id'],
  status: ['status', 'stare'],
  amount: ['commission amount', 'suma comision', 'valoare comision', 'commission', 'comision', 'amount'],
  sale: ['sale amount', 'transaction amount', 'valoare tranzactie', 'valoare vanzare', 'suma vanzare'],
  currency: ['currency', 'moneda'],
  program: ['program unique code', 'unique code', 'program code', 'cod program', 'program', 'advertiser'],
  date: ['created at', 'transaction date', 'data tranzactiei', 'date', 'data'],
  sub: ['stats tags', 'sub id', 'subid', 'click ref', 'clickref', 'epi', 'sid', 'st'],
};

export interface ParsedCommission {
  networkCommissionId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid';
  amountBani: number;
  saleAmountBani: number | null;
  currency: string;
  programExternalId: string | null;
  clickId: number | null;
  occurredAt: Date;
  raw: Record<string, string>;
}

/** Network report → commissions; rows without an id, amount or date are returned as errors. */
export function commissionsFromCsv(text: string): { rows: ParsedCommission[]; errors: string[] } {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], errors: ['empty file'] };
  const names = header.map(fold);
  const col = (key: Column) => {
    for (const alias of COLUMNS[key]) {
      const i = names.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = Object.fromEntries((Object.keys(COLUMNS) as Column[]).map((k) => [k, col(k)])) as Record<Column, number>;
  const errors: string[] = [];
  if (idx.id < 0 || idx.amount < 0 || idx.date < 0) return { rows: [], errors: [`missing columns (need id, amount, date): ${header.join(', ')}`] };
  const rows: ParsedCommission[] = [];
  lines.forEach((cells, n) => {
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const id = get(idx.id);
    const amount = moneyToBani(get(idx.amount));
    const rawDate = get(idx.date);
    const date = /^\d{2}\.\d{2}\.\d{4}/.test(rawDate) ? new Date(`${rawDate.slice(6, 10)}-${rawDate.slice(3, 5)}-${rawDate.slice(0, 2)}T12:00:00Z`) : new Date(rawDate);
    if (!id || amount === null || Number.isNaN(date.getTime())) {
      errors.push(`line ${n + 2}: id, amount or date unreadable`);
      return;
    }
    rows.push({
      networkCommissionId: id,
      status: commissionStatus(get(idx.status) || 'pending'),
      amountBani: amount,
      saleAmountBani: moneyToBani(get(idx.sale)),
      currency: get(idx.currency) || 'RON',
      programExternalId: get(idx.program) || null,
      clickId: clickIdFromSub(get(idx.sub)),
      occurredAt: date,
      raw: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])),
    });
  });
  return { rows, errors };
}
