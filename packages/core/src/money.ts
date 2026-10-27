/**
 * Money convention for the whole code base: amounts are integer **bani** (1 leu = 100 bani),
 * RON, VAT included, held in a plain `number` that must be a safe integer. Never floats.
 * The database stores `numeric(12,2)`; convert at the boundary with `baniToDecimalString` and
 * `decimalStringToBani`. Display with `formatLei`.
 */

/** Integer number of bani (1 leu = 100 bani). */
export type Bani = number;

/** Largest amount a `numeric(12,2)` column holds: 9,999,999,999.99 lei. */
export const MAX_NUMERIC_12_2_BANI: Bani = 999_999_999_999;

export function isBani(value: unknown): value is Bani {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function assertBani(value: number, what = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} must be an integer number of bani, got ${String(value)}`);
  }
}

/** 123456 → "1234.56"; 5 → "0.05"; -150 → "-1.50". For `numeric(12,2)` parameters. */
export function baniToDecimalString(bani: Bani): string {
  assertBani(bani);
  const negative = bani < 0;
  const abs = Math.abs(bani);
  const lei = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${negative ? '-' : ''}${lei}.${cents.toString().padStart(2, '0')}`;
}

/**
 * "1234.56" → 123456; "1234.5" → 123450; "1234" → 123400; "-0.05" → -5. Accepts what PostgreSQL
 * returns for `numeric` (dot decimals, no grouping). Extra decimals are allowed only when they are
 * zeros ("12.500"); anything else throws, so a rounding never happens silently.
 */
export function decimalStringToBani(input: string): Bani {
  const s = input.trim();
  const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new RangeError(`not a decimal amount: "${input}"`);
  const [, sign, intPart = '0', frac = ''] = m;
  if (frac.length > 2 && /[^0]/.test(frac.slice(2))) {
    throw new RangeError(`more than two decimals in "${input}"`);
  }
  const cents = Number((frac + '00').slice(0, 2));
  const value = Number(intPart) * 100 + cents;
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount out of range: "${input}"`);
  return sign === '-' ? -value : value;
}

/**
 * Converts a lei amount written as a JSON number (e.g. `shops.shipping_rules.flat` = 19.99) into
 * bani, rounding half away from zero to the nearest ban.
 */
export function leiToBani(lei: number): Bani {
  if (!Number.isFinite(lei)) throw new RangeError(`not a finite lei amount: ${String(lei)}`);
  const value = Math.sign(lei) * Math.round(Math.abs(lei) * 100 + 1e-9);
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount out of range: ${String(lei)}`);
  return value === 0 ? 0 : value;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface FormatLeiOptions {
  /** `always` (default): "1.234,00 lei"; `auto`: drop ",00" ("1.234 lei"); `never`: round to lei. */
  decimals?: 'always' | 'auto' | 'never';
  /** Append the unit (default true). */
  unit?: boolean;
  /** Use a no-break space before the unit so "lei" never wraps alone (default false). */
  nbsp?: boolean;
}

/**
 * Romanian display format: 123456 → "1.234,56 lei" (dot thousands, comma decimals).
 * `formatLei(123400, { decimals: 'auto' })` → "1.234 lei".
 */
export function formatLei(bani: Bani, options: FormatLeiOptions = {}): string {
  assertBani(bani);
  const { decimals = 'always', unit = true, nbsp = false } = options;
  const negative = bani < 0;
  let abs = Math.abs(bani);
  if (decimals === 'never') abs = Math.round(abs / 100) * 100;
  const lei = Math.floor(abs / 100);
  const cents = abs % 100;
  let text = groupThousands(String(lei));
  if (decimals === 'always' || (decimals === 'auto' && cents !== 0)) {
    text += `,${cents.toString().padStart(2, '0')}`;
  }
  if (negative && abs !== 0) text = `-${text}`;
  return unit ? `${text}${nbsp ? '\u{A0}' : ' '}lei` : text;
}

/** Sum of amounts in bani (throws on non-integers). */
export function sumBani(...amounts: Bani[]): Bani {
  let total = 0;
  for (const a of amounts) {
    assertBani(a);
    total += a;
  }
  assertBani(total, 'sum');
  return total;
}

/**
 * Multiplies an amount by a rational factor `numerator / denominator` with round-half-up
 * (away from zero for negatives), using BigInt so no precision is lost.
 */
export function mulDivRound(bani: Bani, numerator: bigint, denominator: bigint): Bani {
  assertBani(bani);
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  const negative = bani < 0;
  const product = BigInt(Math.abs(bani)) * numerator;
  const rounded = (product * 2n + denominator) / (denominator * 2n);
  const value = Number(rounded);
  assertBani(value, 'result');
  return negative ? -value : value;
}
