/**
 * GTIN validation and normalization (architecture §6.3, GS1 General Specifications 26.0). Pure.
 *
 * Every accepted code is stored as GTIN-14 (`char(14)`, zero-padded). Only `quality: 'valid'`
 * codes may be used for matching; the others are kept for audit and shop statistics.
 */

export type GtinQuality = 'valid' | 'invalid' | 'placeholder' | 'restricted' | 'missing';

export type GtinReason =
  /** Nothing usable was given. */
  | 'empty'
  /** Not 8–14 digits after removing spaces, dashes and dots. */
  | 'malformed'
  /** Mangled by a spreadsheet ("5.94E+12"): digits are lost. */
  | 'scientific_notation'
  | 'bad_check_digit'
  | 'all_zeros'
  /** One digit repeated ("5555555555555"). */
  | 'repeated_digit'
  /** A run of consecutive digits ("1234567890123", "0123456789012"). */
  | 'sequence'
  /** Listed in `KNOWN_FAKE_GTINS` or the shop's own list. */
  | 'known_fake'
  /** Prefixes 02 and 20–29: restricted circulation within a region (incl. variable measure). */
  | 'rcn_region'
  /** Prefix 04: restricted circulation within a company. */
  | 'rcn_company'
  /** EAN-8 prefixes 000–099 and 200–299: restricted circulation (RCN-8). */
  | 'rcn8'
  /** Prefixes 05 and 981–999: coupons. */
  | 'coupon'
  /** Prefix 980: refund receipts. */
  | 'refund_receipt'
  /** Prefix 952: GS1 demonstration and example numbers. */
  | 'demo'
  /** GTIN-14 indicator digit 9: variable-measure trade item. */
  | 'variable_measure';

export type GtinKind = 'gtin8' | 'gtin12' | 'gtin13' | 'gtin14';

export interface GtinResult {
  /**
   * The 14-digit form whenever the digits form a GTIN with a correct check digit (also for
   * placeholders and restricted codes, so admins can see them); null otherwise.
   */
  gtin14: string | null;
  quality: GtinQuality;
  reason?: GtinReason;
  kind?: GtinKind;
  /** ISSN/ISBN/ISMN range (977–979): valid codes for press, books and sheet music. */
  bookland?: boolean;
  /** Set when an ISBN-10 was converted to its ISBN-13 (978…) form. */
  convertedFrom?: 'isbn10';
}

/**
 * Codes known to be fake. Key `*` applies to every shop; other keys are shop slugs. Extend this
 * list (by pull request) when a shop is caught reusing a code, or pass extra codes per call.
 * Values are GTIN-14 strings.
 */
export const KNOWN_FAKE_GTINS: Readonly<Record<string, readonly string[]>> = {
  '*': [
    '05901234123457', // GS1's own check-digit example, copied into feeds as a dummy
  ],
};

export interface ValidateGtinOptions {
  /** Shop slug: its entry in `KNOWN_FAKE_GTINS` is applied too. */
  shopSlug?: string | null;
  /** More fake codes (any GTIN length), e.g. from the shop registry. */
  extraFakes?: Iterable<string> | null;
}

/** GS1 mod-10 check digit for the digits that precede it (any GTIN length). */
export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new RangeError('digits only');
  let sum = 0;
  // Weights 3,1,3,1… counted from the right-most body digit.
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** True when an 8–14 digit code carries a correct GS1 check digit. */
export function isValidGtinCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === code.charCodeAt(code.length - 1) - 48;
}

function kindOf(g14: string): GtinKind {
  if (g14[0] !== '0') return 'gtin14';
  if (g14[1] !== '0') return 'gtin13';
  if (g14.startsWith('000000')) return 'gtin8';
  return 'gtin12';
}

function significant(g14: string, kind: GtinKind): string {
  switch (kind) {
    case 'gtin14':
      return g14;
    case 'gtin13':
      return g14.slice(1);
    case 'gtin12':
      return g14.slice(2);
    case 'gtin8':
      return g14.slice(6);
  }
}

function longestRun(digits: string): number {
  let best = 1;
  let up = 1;
  let down = 1;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1) - 48;
    const cur = digits.charCodeAt(i) - 48;
    up = cur === (prev + 1) % 10 ? up + 1 : 1;
    down = cur === (prev + 9) % 10 ? down + 1 : 1;
    best = Math.max(best, up, down);
  }
  return best;
}

function mostFrequentDigitCount(digits: string): number {
  const counts = new Array<number>(10).fill(0);
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(i) - 48;
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return Math.max(...counts);
}

/**
 * Placeholder patterns, checked on the significant digits (GTIN-13 for 13-digit codes …):
 * all zeros; one digit repeated or at most two digits differing ("5000000000003"); a run of
 * consecutive digits (ascending or descending, wrapping 9→0) of 9+ digits for 12–14 digit codes
 * ("1234567890123", "0123456789012") or of the whole body for GTIN-8 ("12345670").
 */
function placeholderReason(g14: string, kind: GtinKind): GtinReason | null {
  if (/^0+$/.test(g14)) return 'all_zeros';
  const code = significant(g14, kind);
  const body = code.slice(0, -1);
  if (/^(\d)\1+$/.test(body) || mostFrequentDigitCount(code) >= code.length - 2) {
    return 'repeated_digit';
  }
  const threshold = body.length >= 11 ? 9 : body.length;
  if (longestRun(code) >= threshold) return 'sequence';
  return null;
}

function isbn10ToIsbn13(isbn10: string): string | null {
  if (!/^\d{9}[\dX]$/i.test(isbn10)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = isbn10[i] ?? '';
    const v = c === 'X' || c === 'x' ? 10 : Number(c);
    if (c.toUpperCase() === 'X' && i !== 9) return null;
    sum += v * (10 - i);
  }
  if (sum % 11 !== 0) return null;
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${gtinCheckDigit(body)}`;
}

function isKnownFake(g14: string, options: ValidateGtinOptions): boolean {
  if ((KNOWN_FAKE_GTINS['*'] ?? []).includes(g14)) return true;
  const shop = options.shopSlug ? KNOWN_FAKE_GTINS[options.shopSlug] : undefined;
  if (shop?.includes(g14)) return true;
  for (const g of options.extraFakes ?? []) {
    const digits = g.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 14 && digits.padStart(14, '0') === g14) return true;
  }
  return false;
}

function classify(g14: string, options: ValidateGtinOptions): GtinResult {
  const kind = kindOf(g14);
  const placeholder = placeholderReason(g14, kind);
  if (placeholder) return { gtin14: g14, quality: 'placeholder', reason: placeholder, kind };
  if (isKnownFake(g14, options)) {
    return { gtin14: g14, quality: 'placeholder', reason: 'known_fake', kind };
  }
  if (g14[0] === '9')
    return { gtin14: g14, quality: 'restricted', reason: 'variable_measure', kind };
  if (kind === 'gtin8') {
    const p = Number(g14.slice(6, 9));
    if (p <= 99 || (p >= 200 && p <= 299)) {
      return { gtin14: g14, quality: 'restricted', reason: 'rcn8', kind };
    }
    return { gtin14: g14, quality: 'valid', kind };
  }
  const prefix = g14.slice(1, 4);
  const p2 = prefix.slice(0, 2);
  const p3 = Number(prefix);
  const restricted = (reason: GtinReason): GtinResult => ({
    gtin14: g14,
    quality: 'restricted',
    reason,
    kind,
  });
  if (p2 === '02' || prefix[0] === '2') return restricted('rcn_region');
  if (p2 === '04') return restricted('rcn_company');
  if (p2 === '05') return restricted('coupon');
  if (prefix === '952') return restricted('demo');
  if (prefix === '980') return restricted('refund_receipt');
  if (p3 >= 981) return restricted('coupon');
  const result: GtinResult = { gtin14: g14, quality: 'valid', kind };
  if (p3 >= 977 && p3 <= 979) result.bookland = true;
  return result;
}

/**
 * Validates one GTIN as found in a feed or page. Spaces, dashes and dots are ignored; 8–14 digits
 * are zero-padded to 14 (leading zeros lost in spreadsheets are recovered: the check digit
 * arbitrates); an ISBN-10 (also with check character X) is converted to ISBN-13.
 * Order: missing → malformed → placeholder → check digit → restricted ranges → valid.
 */
export function validateGtin(raw: unknown, options: ValidateGtinOptions = {}): GtinResult {
  if (raw == null) return { gtin14: null, quality: 'missing', reason: 'empty' };
  const text = String(raw).trim();
  if (text === '') return { gtin14: null, quality: 'missing', reason: 'empty' };
  if (/^\d+(?:[.,]\d+)?e\+?\d+$/i.test(text)) {
    return { gtin14: null, quality: 'invalid', reason: 'scientific_notation' };
  }
  const digits = text.replace(/[\s.-]/g, '');
  if (/^\d{9}[xX]$/.test(digits)) {
    const isbn13 = isbn10ToIsbn13(digits);
    if (!isbn13) return { gtin14: null, quality: 'invalid', reason: 'bad_check_digit' };
    return { ...classify(isbn13.padStart(14, '0'), options), convertedFrom: 'isbn10' };
  }
  if (!/^\d{8,14}$/.test(digits)) return { gtin14: null, quality: 'invalid', reason: 'malformed' };
  const g14 = digits.padStart(14, '0');
  const kind = kindOf(g14);
  const placeholder = placeholderReason(g14, kind);
  if (placeholder) {
    const gtin14 = isValidGtinCheckDigit(g14) ? g14 : null;
    return { gtin14, quality: 'placeholder', reason: placeholder, kind };
  }
  if (!isValidGtinCheckDigit(g14)) {
    if (digits.length === 10) {
      const isbn13 = isbn10ToIsbn13(digits);
      if (isbn13)
        return { ...classify(isbn13.padStart(14, '0'), options), convertedFrom: 'isbn10' };
    }
    return { gtin14: null, quality: 'invalid', reason: 'bad_check_digit', kind };
  }
  return classify(g14, options);
}

/** The GTIN-14 of a valid code, null for anything that is not `quality: 'valid'`. */
export function normalizeGtin(raw: unknown, options: ValidateGtinOptions = {}): string | null {
  const r = validateGtin(raw, options);
  return r.quality === 'valid' ? r.gtin14 : null;
}

/**
 * Splits a field that may hold several codes ("5901234123457, 4006381333931", arrays from Altex's
 * `ean_codes`) and validates each. A single code written with spaces ("590 1234 12345 7") stays
 * one code. Duplicates (same GTIN-14) are dropped; order is kept.
 */
export function extractGtins(raw: unknown, options: ValidateGtinOptions = {}): GtinResult[] {
  if (raw == null) return [];
  const inputs: string[] = Array.isArray(raw) ? raw.map((x) => String(x)) : [String(raw)];
  const pieces: string[] = [];
  for (const input of inputs) {
    const compact = input.trim().replace(/[\s.-]/g, '');
    if (compact === '') continue;
    if (/^\d{8,14}$/.test(compact) || /^\d{9}[xX]$/.test(compact)) {
      pieces.push(input);
      continue;
    }
    for (const part of input.split(/[,;|/\n]+/)) {
      const p = part.trim();
      if (p === '') continue;
      const c = p.replace(/[\s.-]/g, '');
      if (/^\d{8,14}$/.test(c) || /^\d{9}[xX]$/.test(c) || !/\s/.test(p)) pieces.push(p);
      else pieces.push(...p.split(/\s+/));
    }
  }
  const out: GtinResult[] = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    const r = validateGtin(p, options);
    const key = r.gtin14 ?? `raw:${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

const QUALITY_RANK: Readonly<Record<GtinQuality, number>> = {
  valid: 0,
  placeholder: 1,
  restricted: 2,
  invalid: 3,
  missing: 4,
};

/**
 * Summarizes the codes of one offer: the first valid one (if any), every other valid one, and
 * the most informative quality otherwise (placeholder > restricted > invalid > missing).
 */
export function summarizeGtins(results: readonly GtinResult[]): {
  primary: GtinResult;
  alternates: string[];
} {
  const valid = results.filter((r) => r.quality === 'valid' && r.gtin14 !== null);
  if (valid.length > 0) {
    const [primary, ...rest] = valid;
    return {
      primary: primary as GtinResult,
      alternates: rest.map((r) => r.gtin14 as string),
    };
  }
  const sorted = [...results].sort((a, b) => QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality]);
  return {
    primary: sorted[0] ?? { gtin14: null, quality: 'missing', reason: 'empty' },
    alternates: [],
  };
}
