/**
 * Romanian fiscal identification code (CUI / CIF) of a company. Pure.
 *
 * Format: 2–10 digits, the last one a control digit; companies registered for VAT write it with
 * the prefix "RO" (RO14399840). Control digit: pad the digits before it with leading zeros to 9,
 * multiply them by the key 7 5 3 2 1 7 5 3 2, sum, multiply by 10, take the remainder of the
 * division by 11; a remainder of 10 means 0.
 */
const KEY = [7, 5, 3, 2, 1, 7, 5, 3, 2] as const;

export interface CuiResult {
  ok: boolean;
  /** Digits only, without "RO" (what we store). */
  cui: string | null;
  /** The input carried the "RO" VAT prefix. */
  vatPrefix: boolean;
  reason?: 'empty' | 'format' | 'length' | 'checksum';
}

/** The control digit for the digits that precede it (1–9 digits). */
export function cuiControlDigit(body: string): number {
  if (!/^\d{1,9}$/.test(body)) throw new RangeError('expected 1 to 9 digits');
  const padded = body.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(padded[i]) * KEY[i]!;
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Validates a CUI as typed ("RO 14399840", "ro14399840", "14399840"). */
export function validateCui(input: string | null | undefined): CuiResult {
  const raw = (input ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (raw === '') return { ok: false, cui: null, vatPrefix: false, reason: 'empty' };
  const vatPrefix = raw.startsWith('RO');
  const digits = vatPrefix ? raw.slice(2) : raw;
  if (!/^\d+$/.test(digits)) return { ok: false, cui: null, vatPrefix, reason: 'format' };
  const trimmed = digits.replace(/^0+(?=\d)/, '');
  if (trimmed.length < 2 || trimmed.length > 10) return { ok: false, cui: null, vatPrefix, reason: 'length' };
  const control = Number(trimmed.at(-1));
  if (cuiControlDigit(trimmed.slice(0, -1)) !== control) return { ok: false, cui: null, vatPrefix, reason: 'checksum' };
  return { ok: true, cui: trimmed, vatPrefix };
}
