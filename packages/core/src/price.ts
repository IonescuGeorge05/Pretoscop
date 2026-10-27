/**
 * Price strings as shops display them → integer minor units; VAT; currency conversion. Pure.
 *
 * Separator rules (the classic 1000× bug lives here, so they are explicit and tested):
 * - `format: 'ro'`: `.` and space group thousands, `,` is the decimal separator ("1.234,56").
 * - `format: 'decimal'`: `.` is the decimal separator, `,` and space group thousands ("1,234.56",
 *   "1234.56", JSON-LD and feeds). Extra decimals are rounded ("12.3456" → 12.35, flag `rounded`).
 * - No format (heuristic):
 *   1. both `.` and `,` present → the right-most one is the decimal separator ("1.234,56",
 *      "3,638.99");
 *   2. one kind, several times → thousands ("1.234.567");
 *   3. one kind, once, followed by exactly three digits → thousands ("1.299 Lei" = 1299,
 *      "12.500" = 12500, "1,299" = 1299). Feeds that write "12.500" for 12,50 must declare
 *      `format: 'decimal'`;
 *   4. one kind, once, followed by one or two digits → decimal ("19.99", "1234,5");
 *   5. one kind, once, followed by four or more digits → decimal, only if the extra digits are
 *      zeros ("1299.0000"); otherwise rejected as `unparseable`.
 * - A declared format that does not fit is retried with the heuristic when the result is
 *   unambiguous; the result carries the flag `format_mismatch`.
 * - Spaces (incl. NBSP, narrow NBSP) group thousands only before exactly three digits
 *   ("1 234,56"). Split cents: `1.234<sup>99</sup>` and `1.234 99` (space + exactly two final
 *   digits) mean 1234.99 (eMAG style, flag `split_cents`). A flattened `1.23499` is rejected as
 *   `unparseable`: extractors must keep the superscript separate.
 * - `1.299,- lei` (dash for no decimals) = 1299.
 */
import { type Bani, mulDivRound } from './money';
import { asciiFold, normalizeText } from './text';

export type PriceFormat = 'ro' | 'decimal';

export type PriceRejectReason =
  | 'empty'
  | 'unparseable'
  | 'multiple_numbers'
  | 'range'
  | 'instalment'
  | 'unit_price'
  | 'zero'
  | 'negative'
  | 'placeholder'
  | 'currency'
  | 'currency_mismatch';

export type PriceFlag =
  /** "de la 1.234 lei": a lower bound (variants), not necessarily this offer's price. */
  | 'from'
  /** ≤ 1 unit (1 leu): not a credible main price; normalizeOffer rejects it. */
  | 'below_min'
  /** ≥ 1,000,000 units: kept, but worth a look. */
  | 'suspicious_high'
  /** More than two non-zero decimals were rounded half-up. */
  | 'rounded'
  /** The declared format did not fit; the string was read unambiguously the other way. */
  | 'format_mismatch'
  /** Cents given separately ("1.234<sup>99</sup>", "1.234 99"). */
  | 'split_cents'
  /** The text says the price excludes VAT ("fără TVA"). */
  | 'vat_excluded';

export interface ParsedAmount {
  ok: true;
  /** Amount in minor units of `currency` (bani for RON, cents for EUR). */
  minor: number;
  /** ISO 4217 code: from the text, else the declared currency, else RON. */
  currency: string;
  flags: PriceFlag[];
}

export interface PriceParseError {
  ok: false;
  reason: PriceRejectReason;
  detail?: string;
}

export type AmountParseResult = ParsedAmount | PriceParseError;

export interface ParsedPriceRon {
  ok: true;
  bani: Bani;
  flags: PriceFlag[];
}

export type PriceRonParseResult = ParsedPriceRon | PriceParseError;

export interface ParsePriceOptions {
  format?: PriceFormat | null;
  /** Declared currency (feed field); a different currency in the text is `currency_mismatch`. */
  currency?: string | null;
}

/** Prices at or above this are placeholders ("9.999.999 lei"), never real. */
export const PLACEHOLDER_MIN_MINOR = 999_999_900;
/** Prices at or below this (1 leu) are flagged `below_min`. */
export const BELOW_MIN_MINOR = 100;
/** Prices at or above this (1,000,000 lei) are flagged `suspicious_high`. */
export const SUSPICIOUS_HIGH_MINOR = 100_000_000;

const CURRENCY_ALIASES: Readonly<Record<string, string>> = {
  RON: 'RON',
  'RON.': 'RON',
  LEI: 'RON',
  LEU: 'RON',
  ROL: 'RON',
  EUR: 'EUR',
  EURO: 'EUR',
  EURI: 'EUR',
  '€': 'EUR',
  USD: 'USD',
  $: 'USD',
  GBP: 'GBP',
  '£': 'GBP',
  HUF: 'HUF',
  BGN: 'BGN',
  PLN: 'PLN',
  CHF: 'CHF',
  CZK: 'CZK',
  MDL: 'MDL',
};

/**
 * Normalizes a declared currency: "lei"/"RON"/"ron." → "RON", "€"/"euro" → "EUR"; any other
 * three-letter code is upper-cased; anything else → null. "ROL" (pre-2005 lei) is read as RON:
 * feeds that still write it mean RON.
 */
export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().toUpperCase();
  if (s === '') return null;
  const alias = CURRENCY_ALIASES[s];
  if (alias) return alias;
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

const CURRENCY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['RON', /\b(?:lei|leu|ron)\b/],
  ['EUR', /€|\beur(?:o|i)?\b/],
  ['USD', /\$|\busd\b/],
  ['GBP', /£|\bgbp\b/],
  ['HUF', /\bhuf\b/],
  ['BGN', /\bbgn\b|\bleva\b/],
  ['PLN', /\bpln\b|\bzl\b/],
  ['CHF', /\bchf\b/],
  ['CZK', /\bczk\b/],
  ['MDL', /\bmdl\b/],
];

const INSTALMENT_RE =
  /\/\s*(?:luna|luni|lunar|month)\b|\blei\s*\/\s*l\b|\brat[ae]\b|\brate\b|\blunar\b|\bpe luna\b|\bdobanda\b|\bavans\b|\b\d+\s*x\s*\d|\bx\s*\d+\s*(?:luni|rate)\b/;
const UNIT_PRICE_RE =
  /\b(?:lei|ron)\s*\/\s*(?:kg|g|l|ml|m|mp|m2|100\s*g|100\s*ml)\b|\/\s*(?:kg|100\s*g|100\s*ml)\b/;
const FROM_RE = /\b(?:de la|incepand de la|incepand cu|from|starting at)\b/;
const RANGE_BETWEEN_RE = /^\s*(?:lei|ron)?\s*(?:-|pana la|si|la|to)\s*$/;

/** Detects a statement about VAT in a price or note: "fără TVA" → 'excluded', "TVA inclus" → 'included'. */
export function detectVatMention(text: string | null | undefined): 'excluded' | 'included' | null {
  if (text == null) return null;
  const s = asciiFold(normalizeText(text)).toLowerCase();
  const tva = String.raw`(?:t\.?\s?v\.?\s?a\.?|vat)`;
  const excluded = new RegExp(
    String.raw`\b(?:fara|exclusiv|excl\.?|excluzand|nu include|nu contine|nu este inclus|ex\.?)\s*${tva}(?![a-z])|${tva}\s*(?:neinclus|exclus|nu este inclus)\b|\+\s*${tva}(?![a-z])|\bplus\s+${tva}(?![a-z])|\bexcluding vat\b|\bnet of vat\b`,
  );
  if (excluded.test(s)) return 'excluded';
  const included = new RegExp(
    String.raw`\b(?:cu|inclusiv|incl\.?|include|contine|including)\s*${tva}(?![a-z])|${tva}\s*inclus\b`,
  );
  if (included.test(s)) return 'included';
  return null;
}

interface NumberParse {
  minor: number;
  flags: PriceFlag[];
}

type Sep = '.' | ',' | ' ';

function splitToken(token: string): { groups: string[]; seps: Sep[] } {
  const groups: string[] = [];
  const seps: Sep[] = [];
  let current = '';
  for (const ch of token) {
    if (ch >= '0' && ch <= '9') current += ch;
    else {
      groups.push(current);
      seps.push(ch === ' ' ? ' ' : (ch as Sep));
      current = '';
    }
  }
  groups.push(current);
  return { groups, seps };
}

function validThousands(groups: string[]): boolean {
  if (groups.length === 0) return false;
  const [first, ...rest] = groups;
  if (!first || first.length < 1 || first.length > 3) return false;
  return rest.every((g) => g.length === 3);
}

/**
 * Interprets digit groups with a chosen decimal separator. `decimalSep` = null means "integer".
 * Returns null when the structure does not fit.
 */
function interpret(
  groups: string[],
  seps: Sep[],
  decimalSep: Sep | null,
  groupSeps: ReadonlySet<Sep>,
  allowRounding: boolean,
): NumberParse | null {
  let intGroups = groups;
  let frac = '';
  if (decimalSep !== null) {
    const idx = seps.lastIndexOf(decimalSep);
    if (idx !== seps.length - 1) return null;
    if (seps.slice(0, idx).includes(decimalSep)) return null;
    intGroups = groups.slice(0, idx + 1);
    frac = groups[idx + 1] ?? '';
    if (frac === '') return null;
  }
  const intSeps = decimalSep !== null ? seps.slice(0, -1) : seps;
  if (intSeps.some((s) => !groupSeps.has(s))) return null;
  if (intSeps.length > 0 && !validThousands(intGroups)) return null;
  if (intGroups.some((g) => g === '')) return null;
  const intDigits = intGroups.join('');
  const flags: PriceFlag[] = [];
  let cents: number;
  if (frac.length <= 2) {
    cents = Number((frac + '00').slice(0, 2));
  } else if (!/[^0]/.test(frac.slice(2))) {
    cents = Number(frac.slice(0, 2));
  } else if (allowRounding) {
    const scaled = Number(`${frac.slice(0, 2)}.${frac.slice(2)}`);
    cents = Math.round(scaled);
    flags.push('rounded');
  } else {
    return null;
  }
  const minor = Number(intDigits) * 100 + cents;
  if (!Number.isSafeInteger(minor)) return null;
  return { minor, flags };
}

const RO_GROUPS: ReadonlySet<Sep> = new Set<Sep>(['.', ' ']);
const DEC_GROUPS: ReadonlySet<Sep> = new Set<Sep>([',', ' ']);
const ANY_GROUPS: ReadonlySet<Sep> = new Set<Sep>(['.', ',', ' ']);

function heuristic(groups: string[], seps: Sep[]): NumberParse | null {
  const hasDot = seps.includes('.');
  const hasComma = seps.includes(',');
  if (hasDot && hasComma) {
    const lastDot = seps.lastIndexOf('.');
    const lastComma = seps.lastIndexOf(',');
    return lastComma > lastDot
      ? interpret(groups, seps, ',', RO_GROUPS, false)
      : interpret(groups, seps, '.', DEC_GROUPS, false);
  }
  const kind: Sep | null = hasDot ? '.' : hasComma ? ',' : null;
  if (kind === null) return interpret(groups, seps, null, new Set<Sep>([' ']), false);
  const count = seps.filter((s) => s === kind).length;
  const groupSet = new Set<Sep>([kind, ' ']);
  if (count > 1) return interpret(groups, seps, null, groupSet, false);
  const idx = seps.indexOf(kind);
  const after = groups[idx + 1] ?? '';
  if (after.length === 3) {
    const asThousands = interpret(groups, seps, null, groupSet, false);
    if (asThousands) return asThousands;
  }
  if (after.length === 3) return null;
  return interpret(groups, seps, kind, new Set<Sep>([' ']), false);
}

function parseNumberToken(
  token: string,
  format: PriceFormat | null | undefined,
): NumberParse | null {
  const { groups, seps } = splitToken(token);
  if (format === 'ro' || format === 'decimal') {
    const decimalSep: Sep = format === 'ro' ? ',' : '.';
    const groupSeps = format === 'ro' ? RO_GROUPS : DEC_GROUPS;
    const declared = seps.includes(decimalSep)
      ? interpret(groups, seps, decimalSep, groupSeps, true)
      : interpret(groups, seps, null, groupSeps, true);
    if (declared) return declared;
    const fallback = heuristic(groups, seps);
    if (fallback) return { minor: fallback.minor, flags: [...fallback.flags, 'format_mismatch'] };
    return null;
  }
  return heuristic(groups, seps);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  euro: '€',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes numeric character references (&#46; &#x2c;) and a few named entities. */
function decodeEntities(s: string): string {
  return s.replace(
    /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi,
    (m, dec?: string, hex?: string, name?: string) => {
      if (dec !== undefined || hex !== undefined) {
        const code = dec !== undefined ? Number(dec) : Number.parseInt(hex ?? '', 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return NAMED_ENTITIES[(name ?? '').toLowerCase()] ?? m;
    },
  );
}

function finish(minor: number, currency: string, flags: PriceFlag[]): AmountParseResult {
  if (minor === 0) return { ok: false, reason: 'zero' };
  if (minor >= PLACEHOLDER_MIN_MINOR) return { ok: false, reason: 'placeholder' };
  const intPart = String(Math.floor(minor / 100));
  if (intPart.length >= 6 && /^9+$/.test(intPart)) return { ok: false, reason: 'placeholder' };
  const out = [...flags];
  if (minor <= BELOW_MIN_MINOR) out.push('below_min');
  if (minor >= SUSPICIOUS_HIGH_MINOR) out.push('suspicious_high');
  return { ok: true, minor, currency, flags: out };
}

/**
 * Parses a displayed price in any currency into minor units. See the module comment for the
 * separator rules. Rejects ranges ("1.000 - 2.000 lei"), instalments ("99 lei/lună", "12 rate"),
 * unit prices ("12,99 lei/kg"), several numbers, zero, negatives and placeholders (≥ 9.999.999).
 */
export function parsePrice(input: unknown, options: ParsePriceOptions = {}): AmountParseResult {
  const declared = normalizeCurrencyCode(options.currency ?? null);
  if (options.currency != null && options.currency.trim() !== '' && declared === null) {
    return { ok: false, reason: 'currency', detail: `unknown currency "${options.currency}"` };
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ok: false, reason: 'unparseable' };
    if (input < 0) return { ok: false, reason: 'negative' };
    const scaled = input * 100;
    const minor = Math.round(scaled);
    const flags: PriceFlag[] = Math.abs(scaled - minor) > 1e-6 ? ['rounded'] : [];
    return finish(minor, declared ?? 'RON', flags);
  }
  if (input == null || (typeof input !== 'string' && typeof input !== 'bigint')) {
    return { ok: false, reason: 'empty' };
  }
  let raw = decodeEntities(String(input));
  let splitCents: string | null = null;
  // eMAG writes cents in a superscript, sometimes after a hidden separator:
  // 3&#46;170<sup><small class="mf-decimal">&#44;</small>99</sup> → 3170 lei + 99 bani.
  const sup = /<sup[^>]*>([\s\S]*?)<\/sup>/i.exec(raw);
  const supText = sup ? (sup[1] ?? '').replace(/<[^>]*>/g, '').trim() : '';
  const supCents = /^[.,]?\s*(\d{1,2})$/.exec(supText);
  if (sup && supCents) {
    splitCents = (supCents[1] ?? '').padEnd(2, '0');
    raw = raw.slice(0, sup.index) + raw.slice(sup.index + sup[0].length);
  }
  raw = raw.replace(/<[^>]*>/g, ' ');
  const text = normalizeText(raw);
  if (text === '') return { ok: false, reason: 'empty' };
  let low = asciiFold(text).toLowerCase();

  if (INSTALMENT_RE.test(low)) return { ok: false, reason: 'instalment' };
  if (UNIT_PRICE_RE.test(low)) return { ok: false, reason: 'unit_price' };
  const flags: PriceFlag[] = [];
  if (detectVatMention(low) === 'excluded') flags.push('vat_excluded');

  const found = CURRENCY_PATTERNS.filter(([, re]) => re.test(low)).map(([code]) => code);
  if (found.length > 1) return { ok: false, reason: 'currency_mismatch', detail: found.join('/') };
  const detected = found[0] ?? null;
  if (detected && declared && detected !== declared) {
    return {
      ok: false,
      reason: 'currency_mismatch',
      detail: `${detected} in text, ${declared} declared`,
    };
  }
  const currency = detected ?? declared ?? 'RON';

  low = low.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');
  low = low.replace(/(\d)\s*[.,]\s*-+(?!\s*\d)/g, '$1');
  const tokens: { text: string; index: number }[] = [];
  const re = /-?\d(?:[\d.,]|\s(?=\d))*/g;
  for (let m = re.exec(low); m !== null; m = re.exec(low)) {
    const tok = m[0].replace(/[.,\s]+$/, '');
    tokens.push({ text: tok, index: m.index });
  }
  if (tokens.length === 0) return { ok: false, reason: 'empty' };
  if (tokens.length > 1) {
    const [a, b] = tokens;
    if (a && b && tokens.length === 2) {
      const between = low.slice(a.index + a.text.length, b.index);
      const glued = between.trim() === '' && b.text.startsWith('-'); // "1.000-2.000 lei"
      if (RANGE_BETWEEN_RE.test(between) || glued) return { ok: false, reason: 'range' };
    }
    return { ok: false, reason: 'multiple_numbers' };
  }
  const only = tokens[0];
  if (!only) return { ok: false, reason: 'empty' };
  let token = only.text;
  if (token.startsWith('-')) return { ok: false, reason: 'negative' };
  if (/\bpana la\b/.test(low.slice(only.index + token.length)) && FROM_RE.test(low)) {
    return { ok: false, reason: 'range' };
  }
  if (FROM_RE.test(low.slice(0, only.index))) flags.push('from');

  const integerWithAnyGrouping = (digits: string): NumberParse | null => {
    const { groups, seps } = splitToken(digits);
    return interpret(groups, seps, null, ANY_GROUPS, false);
  };
  let parsed: NumberParse | null;
  if (splitCents !== null) {
    const asInt = integerWithAnyGrouping(token);
    parsed = asInt ? { minor: asInt.minor + Number(splitCents), flags: ['split_cents'] } : null;
  } else {
    const spaceCents = /^(.*\d)\s(\d{2})$/.exec(token);
    if (spaceCents && !/[.,]\d{1,2}$/.test(spaceCents[1] ?? '')) {
      const asInt = integerWithAnyGrouping(spaceCents[1] ?? '');
      parsed = asInt
        ? { minor: asInt.minor + Number(spaceCents[2]), flags: ['split_cents'] }
        : null;
    } else {
      token = token.replace(/\s+/g, ' ');
      parsed = parseNumberToken(token, options.format ?? null);
    }
  }
  if (!parsed) return { ok: false, reason: 'unparseable', detail: token };
  return finish(parsed.minor, currency, [...flags, ...parsed.flags]);
}

/**
 * Parses a displayed RON price into bani. Same rules as `parsePrice`; a string that names another
 * currency ("99 €") is rejected with reason `currency` (use `parsePrice` with a declared currency
 * and `convertToRonBani` for those).
 */
export function parsePriceRon(input: unknown, format?: PriceFormat | null): PriceRonParseResult {
  const r = parsePrice(input, { format: format ?? null });
  if (!r.ok) return r;
  if (r.currency !== 'RON') return { ok: false, reason: 'currency', detail: r.currency };
  return { ok: true, bani: r.minor, flags: r.flags };
}

const FREE_SHIPPING_RE =
  /\b(?:gratuit[aă]?|gratis|free|fara cost|fara costuri|0\s*(?:lei|ron))\b|\blivrare gratuit/;

/**
 * Parses a shipping cost: "Gratuit", "Livrare gratuită", "free", "0 lei" → 0; otherwise like
 * `parsePrice` (zero allowed). Returns minor units of the declared currency (RON by default).
 * A conditional statement ("gratuit peste 200 lei") is a rule, not a cost: `unparseable`.
 */
export function parseShippingCost(
  input: unknown,
  options: ParsePriceOptions = {},
): AmountParseResult {
  const free = (): ParsedAmount => ({
    ok: true,
    minor: 0,
    currency: normalizeCurrencyCode(options.currency ?? null) ?? 'RON',
    flags: [],
  });
  if (typeof input === 'string') {
    const low = asciiFold(normalizeText(input)).toLowerCase();
    if (FREE_SHIPPING_RE.test(low)) {
      return /[1-9]/.test(low)
        ? { ok: false, reason: 'unparseable', detail: 'conditional free shipping' }
        : free();
    }
  }
  if (input === 0) return free();
  const r = parsePrice(input, options);
  if (!r.ok && r.reason === 'zero') return free();
  if (r.ok) return { ...r, flags: r.flags.filter((f) => f !== 'below_min') };
  return r;
}

// ---------------------------------------------------------------------------------------------
// VAT

interface VatPeriod {
  /** First instant (UTC) the rate applies: local midnight in Europe/Bucharest. */
  from: number;
  rate: number;
}

/**
 * Romanian standard VAT rate history, newest first (rates in percent). 21% from 1 Aug 2025
 * (Law 141/2025), 19% from 1 Jan 2017, 20% in 2016, 24% from 1 Jul 2010, 19% before.
 */
const STANDARD_VAT: readonly VatPeriod[] = [
  { from: Date.UTC(2025, 6, 31, 21), rate: 21 },
  { from: Date.UTC(2016, 11, 31, 22), rate: 19 },
  { from: Date.UTC(2015, 11, 31, 22), rate: 20 },
  { from: Date.UTC(2010, 5, 30, 21), rate: 24 },
  { from: Number.NEGATIVE_INFINITY, rate: 19 },
];

/** Standard VAT rate (percent) valid at an instant, using Romanian local midnight boundaries. */
export function vatRateAt(date: Date): number {
  const t = date.getTime();
  if (Number.isNaN(t)) throw new RangeError('invalid date');
  for (const p of STANDARD_VAT) if (t >= p.from) return p.rate;
  return 19;
}

/** Adds the standard VAT valid at `date` to a net amount, rounding half-up to the ban. */
export function grossUpVat(netBani: Bani, date: Date): Bani {
  const rate = vatRateAt(date);
  return mulDivRound(netBani, BigInt(100 + rate), 100n);
}

// ---------------------------------------------------------------------------------------------
// Currency

/**
 * Converts an amount in minor units of `currency` to RON bani with a rate expressed as RON per
 * one unit of the currency (BNR publishes EUR 5.3487 on 2026-10-27; for HUF, divide BNR's
 * per-100 rate by 100 first). Rounds half-up. RON passes through unchanged. No fetching here:
 * the caller supplies the BNR reference rate of the observation day.
 */
export function convertToRonBani(
  amountMinor: number,
  currency: string,
  ronPerUnit: number | null | undefined,
): Bani {
  const code = normalizeCurrencyCode(currency);
  if (code === 'RON') return amountMinor;
  if (ronPerUnit == null || !Number.isFinite(ronPerUnit) || ronPerUnit <= 0) {
    throw new RangeError(`a positive RON rate is required to convert ${currency}`);
  }
  const scaled = Math.round(ronPerUnit * 1_000_000);
  return mulDivRound(amountMinor, BigInt(scaled), 1_000_000n);
}
