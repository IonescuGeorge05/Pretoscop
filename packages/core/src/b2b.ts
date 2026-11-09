/**
 * B2B price intelligence (M28): plans, SKU import parsing, position arithmetic, API key format and
 * CSV serialization. Pure: no I/O, no randomness, no clock (callers pass what they need), safe for
 * browser bundles. Money is integer bani (RON incl. VAT) everywhere.
 */
import type { Bani } from './money';
import { normalizeGtin } from './gtin';
import { normalizeMpn } from './mpn';
import { parsePriceRon } from './price';
import { foldLower, normalizeText } from './text';

// ---------------------------------------------------------------------------------------------
// Plans

export type B2bPlan = 'pilot' | 'starter' | 'pro' | 'enterprise';
export const B2B_PLANS_ORDER: readonly B2bPlan[] = ['pilot', 'starter', 'pro', 'enterprise'];

export interface B2bPlanLimits {
  readonly label: string;
  /** SKUs a workspace may track. */
  readonly skuLimit: number;
  /** API requests per Europe/Bucharest calendar day; 0 = no API access. */
  readonly apiDailyQuota: number;
  /** Burst limit per API key and minute (per web process). */
  readonly apiPerMinute: number;
  /** List price per month without VAT, in euro cents; null = set by contract (or free for the pilot). */
  readonly monthlyEurCents: number | null;
  /** Self-serve subscription through the payment provider (pilot and enterprise: by the founders). */
  readonly selfServe: boolean;
}

/**
 * Plans of docs/08 §B2B (Starter €49 / 200 SKUs, Pro €149 / 2,000 SKUs + API, Enterprise €399+ /
 * 10k SKUs). The pilot is free, provisioned by an admin, with every feature at a pilot size.
 * Data freshness is the recorder's and the same for every plan (docs/progress M28 report).
 */
export const B2B_PLANS: Readonly<Record<B2bPlan, B2bPlanLimits>> = {
  pilot: { label: 'Pilot', skuLimit: 500, apiDailyQuota: 2_000, apiPerMinute: 60, monthlyEurCents: null, selfServe: false },
  starter: { label: 'Starter', skuLimit: 200, apiDailyQuota: 0, apiPerMinute: 0, monthlyEurCents: 4_900, selfServe: true },
  pro: { label: 'Pro', skuLimit: 2_000, apiDailyQuota: 10_000, apiPerMinute: 120, monthlyEurCents: 14_900, selfServe: true },
  enterprise: { label: 'Enterprise', skuLimit: 10_000, apiDailyQuota: 100_000, apiPerMinute: 600, monthlyEurCents: 39_900, selfServe: false },
};

export function isB2bPlan(v: unknown): v is B2bPlan {
  return typeof v === 'string' && (B2B_PLANS_ORDER as readonly string[]).includes(v);
}

/** Effective limits of a workspace: the plan's, unless an admin set an override (null = plan). */
export function effectiveLimits(plan: B2bPlan, overrides: { skuLimit?: number | null; apiDailyQuota?: number | null } = {}): B2bPlanLimits {
  const base = B2B_PLANS[plan];
  return {
    ...base,
    skuLimit: overrides.skuLimit ?? base.skuLimit,
    apiDailyQuota: overrides.apiDailyQuota ?? base.apiDailyQuota,
  };
}

// ---------------------------------------------------------------------------------------------
// SKU import

/** Most lines one import may hold (the plan's SKU limit applies on top). */
export const B2B_IMPORT_MAX_LINES = 10_000;
const FIELD_MAX = 200;

export type B2bImportField = 'gtin' | 'mpn' | 'brand' | 'ref' | 'label' | 'price';

/** Header names (folded: lower case, no diacritics, spaces/dashes → `_`) per field. */
const HEADER_ALIASES: Record<B2bImportField, readonly string[]> = {
  gtin: ['gtin', 'ean', 'ean13', 'gtin13', 'gtin14', 'upc', 'barcode', 'cod_bare', 'cod_de_bare', 'isbn'],
  mpn: ['mpn', 'part_number', 'partnumber', 'pn', 'cod_producator', 'model', 'cod_model'],
  brand: ['brand', 'marca', 'producator', 'manufacturer'],
  ref: ['sku', 'cod', 'cod_intern', 'ref', 'referinta', 'cod_produs', 'id'],
  label: ['nume', 'denumire', 'name', 'titlu', 'title', 'produs'],
  price: ['pret', 'price', 'pret_recomandat', 'pret_referinta', 'rrp', 'msrp', 'pret_propriu'],
};

export interface B2bImportLine {
  /** 1-based line number in the pasted text (header included). */
  line: number;
  /** GTIN-14 with a valid check digit, or null. */
  gtin: string | null;
  /** Normalized MPN (upper case, alphanumerics), or null. */
  mpn: string | null;
  /** MPN as written (for display). */
  mpnRaw: string | null;
  brand: string | null;
  ref: string | null;
  label: string | null;
  /** The customer's own or recommended price (brands), bani incl. VAT. */
  referencePriceBani: Bani | null;
  /** Romanian problems with this line (a line with an error is not imported). */
  errors: string[];
}

export interface B2bImportParse {
  /** Columns recognized in the header (empty: one code per line, no header). */
  columns: B2bImportField[];
  lines: B2bImportLine[];
  /** Problems with the whole text (no lines, too many lines). */
  errors: string[];
}

function foldHeader(s: string): string {
  return foldLower(s)
    .trim()
    .replace(/[\s.-]+/g, '_');
}

function headerField(cell: string): B2bImportField | null {
  const h = foldHeader(cell);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[B2bImportField, readonly string[]]>) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/** Splits one delimited line (RFC 4180 quotes, doubled quotes inside). */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (c === delimiter) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** Tab, semicolon or comma, whichever splits the header line into the most cells. */
function detectDelimiter(header: string): string {
  let best = ',';
  let bestCount = 0;
  for (const d of ['\t', ';', ',']) {
    const n = splitDelimitedLine(header, d).length;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

function cleanField(v: string | undefined): string | null {
  if (v === undefined) return null;
  const s = normalizeText(v).trim().slice(0, FIELD_MAX);
  return s === '' ? null : s;
}

/**
 * Parses a pasted or uploaded SKU list. With a header line naming known columns (GTIN/EAN, MPN /
 * cod producător, brand / marcă, SKU / cod intern, nume, preț), every line is read by column;
 * without one, each line holds one code: digits that form a valid GTIN are a GTIN, anything else
 * is an MPN. Empty lines are skipped. A line needs a valid GTIN or an MPN; an unreadable price is
 * an error on that line only.
 */
export function parseB2bImport(text: string): B2bImportParse {
  const raw = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const numbered = raw.map((t, i) => ({ t, n: i + 1 })).filter((l) => l.t.trim() !== '');
  if (numbered.length === 0) return { columns: [], lines: [], errors: ['Lista este goală.'] };
  const delimiter = detectDelimiter(numbered[0]!.t);
  const headerCells = splitDelimitedLine(numbered[0]!.t, delimiter);
  const mapped = headerCells.map(headerField);
  const hasHeader = mapped.some((f) => f !== null);
  const body = hasHeader ? numbered.slice(1) : numbered;
  if (body.length > B2B_IMPORT_MAX_LINES) {
    return { columns: [], lines: [], errors: [`Lista are ${body.length} rânduri; poți importa cel mult ${B2B_IMPORT_MAX_LINES} odată.`] };
  }
  const columns = hasHeader ? (mapped.filter((f) => f !== null) as B2bImportField[]) : [];
  if (hasHeader && !columns.includes('gtin') && !columns.includes('mpn')) {
    return { columns, lines: [], errors: ['Antetul trebuie să aibă o coloană GTIN/EAN sau una MPN (cod producător).'] };
  }
  const lines: B2bImportLine[] = [];
  for (const { t, n } of body) {
    const cells = hasHeader ? splitDelimitedLine(t, delimiter) : [t.trim()];
    const get = (f: B2bImportField): string | null => {
      if (!hasHeader) return null;
      const idx = mapped.indexOf(f);
      return idx < 0 ? null : cleanField(cells[idx]);
    };
    const errors: string[] = [];
    let gtinText: string | null;
    let mpnText: string | null;
    if (hasHeader) {
      gtinText = get('gtin');
      mpnText = get('mpn');
    } else {
      // One code per line: a valid GTIN is a GTIN; anything else (numeric part codes too) an MPN.
      const single = cleanField(cells[0]);
      gtinText = single && normalizeGtin(single) ? single : null;
      mpnText = gtinText ? null : single;
    }
    const gtin = gtinText ? normalizeGtin(gtinText) : null;
    if (gtinText && !gtin) errors.push(`GTIN invalid: ${gtinText}`);
    const mpn = mpnText ? normalizeMpn(mpnText) : null;
    if (mpnText && !mpn && !gtin) errors.push(`MPN prea scurt sau generic: ${mpnText}`);
    if (!gtinText && !mpnText) errors.push('Lipsește GTIN-ul sau MPN-ul.');
    let referencePriceBani: Bani | null = null;
    const priceText = get('price');
    if (priceText) {
      const p = parsePriceRon(priceText);
      if (p.ok) referencePriceBani = p.bani;
      else errors.push(`Preț de necitit: ${priceText}`);
    }
    lines.push({
      line: n,
      gtin,
      mpn,
      mpnRaw: mpn ? mpnText : null,
      brand: get('brand'),
      ref: get('ref'),
      label: get('label'),
      referencePriceBani,
      errors,
    });
  }
  return { columns, lines, errors: [] };
}

/**
 * The identity of a tracked SKU inside a workspace (unique per workspace): the product once it is
 * known, else the GTIN, else brand + MPN. Two lines with the same identity are one SKU.
 */
export function skuIdentity(input: { productId?: number | null; gtin?: string | null; mpn?: string | null; brand?: string | null }): string | null {
  if (input.productId) return `product:${input.productId}`;
  if (input.gtin) return `gtin:${input.gtin}`;
  if (input.mpn) return `mpn:${foldLower(input.brand ?? '').replace(/[^a-z0-9]/g, '')}:${input.mpn}`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Position arithmetic

export type B2bPositionStatus = 'cheapest' | 'tied' | 'above' | 'alone' | 'no_price' | 'no_data';

export interface B2bPosition {
  /** Lowest competitor total (fresh, in stock, new), bani. */
  minBani: Bani | null;
  /** Median of competitor totals, bani (mean of the two middle values, rounded half up). */
  medianBani: Bani | null;
  competitors: number;
  /** 1 + competitors strictly cheaper than ours (ties share a rank); null without our price. */
  rank: number | null;
  /** (ours − min) / min × 100, one decimal; null without both. */
  gapToMinPct: number | null;
  status: B2bPositionStatus;
}

export function medianBani(values: readonly Bani[]): Bani | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  const sum = s[mid - 1]! + s[mid]!;
  return Math.floor(sum / 2) + (sum % 2 === 0 ? 0 : 1);
}

/** Percentage with one decimal, rounded half away from zero, without float drift. */
export function pctOneDecimal(num: number, den: number): number | null {
  if (den === 0) return null;
  const tenths = Math.round(Math.abs((num * 1000) / den)) / 10;
  return num < 0 !== den < 0 && tenths !== 0 ? -tenths : tenths;
}

/**
 * Where our price stands among the comparable competitor offers (the caller passes only those:
 * fresh, in stock, new condition, other shops). `ownBani` is our live offer's total, or the
 * reference price of a brand workspace.
 */
export function computePosition(ownBani: Bani | null, competitorBani: readonly Bani[], hasAnyOffer = competitorBani.length > 0): B2bPosition {
  const min = competitorBani.length ? Math.min(...competitorBani) : null;
  const median = medianBani(competitorBani);
  const competitors = competitorBani.length;
  if (ownBani === null) {
    return { minBani: min, medianBani: median, competitors, rank: null, gapToMinPct: null, status: hasAnyOffer ? 'no_price' : 'no_data' };
  }
  if (min === null) return { minBani: null, medianBani: null, competitors: 0, rank: 1, gapToMinPct: null, status: 'alone' };
  const cheaper = competitorBani.filter((c) => c < ownBani).length;
  const status: B2bPositionStatus = ownBani < min ? 'cheapest' : ownBani === min ? 'tied' : 'above';
  return { minBani: min, medianBani: median, competitors, rank: cheaper + 1, gapToMinPct: pctOneDecimal(ownBani - min, min), status };
}

export const B2B_STATUS_LABELS: Readonly<Record<B2bPositionStatus, string>> = {
  cheapest: 'cel mai mic preț',
  tied: 'la egalitate cu cel mai mic',
  above: 'peste cel mai mic',
  alone: 'fără concurenți',
  no_price: 'fără prețul tău',
  no_data: 'fără oferte',
};

// ---------------------------------------------------------------------------------------------
// API keys: `psk_<public id>_<secret>`; only a hash of the secret is stored.

export const B2B_API_KEY_PREFIX = 'psk_';
/** Public id: 12 lower-case base32 characters (60 bits), indexed for the lookup. */
const PUBLIC_ID = /^[a-z2-7]{12}$/;
/** Secret: 43 base64url characters (32 random bytes). */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export function formatApiKey(publicId: string, secret: string): string {
  if (!PUBLIC_ID.test(publicId) || !SECRET.test(secret)) throw new Error('formatApiKey: malformed parts');
  return `${B2B_API_KEY_PREFIX}${publicId}_${secret}`;
}

/** Splits a presented key; null when it cannot be one of ours (no database lookup needed). */
export function parseApiKey(raw: string | null | undefined): { publicId: string; secret: string } | null {
  if (typeof raw !== 'string' || raw.length !== B2B_API_KEY_PREFIX.length + 12 + 1 + 43) return null;
  if (!raw.startsWith(B2B_API_KEY_PREFIX)) return null;
  const publicId = raw.slice(B2B_API_KEY_PREFIX.length, B2B_API_KEY_PREFIX.length + 12);
  const sep = raw[B2B_API_KEY_PREFIX.length + 12];
  const secret = raw.slice(B2B_API_KEY_PREFIX.length + 13);
  if (sep !== '_' || !PUBLIC_ID.test(publicId) || !SECRET.test(secret)) return null;
  return { publicId, secret };
}

/** The key from `Authorization: Bearer …` (case-insensitive scheme), else null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
  return m ? m[1]! : null;
}

// ---------------------------------------------------------------------------------------------
// CSV (RFC 4180, CRLF, UTF-8 with BOM) safe against formula injection.

/** A text cell, or a number we formatted ourselves (a decimal string or an integer). */
export type CsvCell = { text: string | null } | { num: string | number | null };

const FORMULA_START = /^[=+\-@\t\r]/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * One text cell, always quoted. A value that a spreadsheet would read as a formula (it starts with
 * = + - @, a tab or a carriage return, also after leading spaces) gets a leading apostrophe
 * (OWASP CSV injection guidance); quotes are doubled.
 */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  let v = String(value);
  if (FORMULA_START.test(v) || FORMULA_START.test(v.replace(/^[ \u00a0]+/, ''))) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/** One numeric cell: only plain decimals pass unquoted; anything else is treated as text. */
export function csvNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  return DECIMAL.test(s) ? s : csvText(s);
}

export function csvCell(cell: CsvCell): string {
  return 'text' in cell ? csvText(cell.text) : csvNumber(cell.num);
}

/** A whole file: BOM, quoted header, one CRLF-terminated line per row. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header.map((h) => csvText(h)).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Bani as a plain decimal in lei ("1234.56") for CSV and API payloads; null stays null. */
export function baniToLeiString(bani: Bani | null): string | null {
  if (bani === null) return null;
  const neg = bani < 0;
  const abs = Math.abs(bani);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
