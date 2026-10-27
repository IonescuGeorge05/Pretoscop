/**
 * Conversions between integer bani (core's money unit) and numeric(12,2) strings (the database).
 * String arithmetic only: no floats touch a price.
 */
export function baniToNumeric(bani: number): string {
  if (!Number.isSafeInteger(bani)) throw new Error(`bani must be a safe integer, got ${bani}`);
  const neg = bani < 0;
  const digits = String(Math.abs(bani)).padStart(3, '0');
  return `${neg ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function numericToBani(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`not a numeric(12,2) value: ${value}`);
  const [, sign, int = '0', frac = ''] = m;
  const bani = Number(int) * 100 + Number(frac.padEnd(2, '0'));
  return sign ? -bani : bani;
}

export function nullableBaniToNumeric(bani: number | null | undefined): string | null {
  return bani === null || bani === undefined ? null : baniToNumeric(bani);
}
