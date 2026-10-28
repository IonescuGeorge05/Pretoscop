/**
 * What may leave Pretoscop for the Anthropic API (CLAUDE.md, ADR-016, ADR-024). Prompts are built
 * only from these whitelisted fields of offers and catalogue products:
 *   - never Icecat content (`product_specs` / `product_images` rows with source 'icecat': licence
 *     forbids AI use and export) — inputs carrying Icecat data are refused;
 *   - never personal data: marketplace seller names can be natural persons, so seller fields are
 *     refused; e-mail addresses and Romanian phone numbers inside titles are redacted;
 *   - no URLs, no internal ids, no user data.
 * Every prompt module calls `sanitizeSide`; the tests send sentinel values through the whole
 * pipeline and assert that none reaches the wire.
 */

export class ForbiddenDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenDataError';
  }
}

/** Attribute keys produced by our own title parser (M06); nothing else is forwarded. */
export const ALLOWED_ATTRIBUTE_KEYS = [
  'kind',
  'storageGb',
  'ramGb',
  'vramGb',
  'screenInches',
  'resolution',
  'color',
  'year',
  'generation',
  'connectivity',
  'energyClass',
  'capacityL',
  'capacityKg',
  'powerW',
  'edition',
  'caseSizeMm',
  'packCount',
] as const;

const ALLOWED = new Set<string>(ALLOWED_ATTRIBUTE_KEYS);

/** Keys whose presence means a caller passed data that must never be sent. */
const FORBIDDEN_KEY = /icecat|spec|seller|email|e_mail|phone|telefon|user|customer|ip_?hash|url/i;

export type SafeAttributeValue = string | number | boolean | string[];

export interface SafeSide {
  title: string;
  brand: string | null;
  mpn: string | null;
  gtin: string | null;
  category: string | null;
  attributes: Record<string, SafeAttributeValue>;
  /** Offer: total price in lei; product: lowest current total in lei (a hint only). */
  priceLei: number | null;
}

export interface SafeOfferSide extends SafeSide {
  /** The shop's public name (a company, never a marketplace seller). */
  shop: string | null;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Romanian mobile and landline numbers, optionally with +40/0040 and separators. Thirteen-digit
// GTINs and part codes are not touched (no separators, other lengths).
const PHONE = /(?<![\p{L}\p{N}])(?:(?:\+|00)40[\s.-]?|0)(?:7\d{2}|[23]\d{2})[\s.-]?\d{3}[\s.-]?\d{3}(?![\p{L}\p{N}])/gu;

/** Removes e-mail addresses and phone numbers that sellers sometimes put in titles. */
export function redactPersonalData(text: string): string {
  return text.replace(EMAIL, '[e-mail eliminat]').replace(PHONE, '[telefon eliminat]');
}

function assertNotForbidden(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  if (!Array.isArray(value) && (value as { source?: unknown }).source === 'icecat') {
    throw new ForbiddenDataError(`${path}: Icecat data must never be sent to the LLM (ADR-016)`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(k)) throw new ForbiddenDataError(`${path}.${k}: field not allowed in an LLM prompt (personal or licensed data)`);
    assertNotForbidden(v, `${path}.${k}`);
  }
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = redactPersonalData(v.normalize('NFC').replace(/\s+/g, ' ').trim());
  return t ? t.slice(0, max) : null;
}

function attributes(v: unknown, path: string): Record<string, SafeAttributeValue> {
  const out: Record<string, SafeAttributeValue> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const key of ALLOWED_ATTRIBUTE_KEYS) {
    const x = (v as Record<string, unknown>)[key];
    if (typeof x === 'number' && Number.isFinite(x)) out[key] = x;
    else if (typeof x === 'boolean') out[key] = x;
    else if (typeof x === 'string' && x.length <= 40) out[key] = redactPersonalData(x);
    else if (Array.isArray(x) && x.every((i) => typeof i === 'string' && i.length <= 40)) out[key] = [...(x as string[])];
  }
  for (const k of Object.keys(v)) if (!ALLOWED.has(k) && FORBIDDEN_KEY.test(k)) throw new ForbiddenDataError(`${path}.attributes.${k}: not allowed`);
  return out;
}

function price(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export interface RawSide {
  title: string;
  brand?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  category?: string | null;
  attributes?: Record<string, unknown> | null;
  priceLei?: number | string | null;
  shop?: string | null;
  [other: string]: unknown;
}

/** Whitelists and cleans one side of a prompt; throws `ForbiddenDataError` on Icecat or personal-data fields. */
export function sanitizeSide(raw: RawSide, path = 'side'): SafeOfferSide {
  assertNotForbidden(raw, path);
  const title = text(raw.title, 300);
  if (!title) throw new ForbiddenDataError(`${path}: a title is required`);
  return {
    title,
    brand: text(raw.brand, 80),
    mpn: text(raw.mpn, 60),
    gtin: typeof raw.gtin === 'string' && /^\d{8,14}$/.test(raw.gtin) ? raw.gtin : null,
    category: text(raw.category, 120),
    attributes: attributes(raw.attributes, path),
    priceLei: price(raw.priceLei),
    shop: text(raw.shop, 80),
  };
}
