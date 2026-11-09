import { shopForHost, type ShopDef } from './shops';

/**
 * What the extension sends about the page a user has open: nothing but these four identifiers of
 * the product (the page URL without query or fragment, a GTIN, brand + manufacturer part number).
 * Every value read from a page is untrusted: it is checked here, in the content script before
 * sending and again in the background worker before any request.
 */
export interface PageIds {
  url: string;
  gtin?: string;
  brand?: string;
  mpn?: string;
}

const LIMITS = { url: 2048, brand: 80, mpn: 64 };

function hasControlChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || (c >= 127 && c < 160)) return true;
  }
  return false;
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** GS1 check digit over the whole code (8, 12, 13 or 14 digits). */
export function gtinCheckOk(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code) || /^0+$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < code.length - 1; i++) {
    const digit = code.charCodeAt(code.length - 2 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === code.charCodeAt(code.length - 1) - 48;
}

/** A GTIN with a valid check digit (spaces and dashes removed), else undefined. */
export function cleanGtin(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const digits = String(raw).replace(/[\s-]/g, '');
  return gtinCheckOk(digits) ? digits : undefined;
}

const MPN_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._/+#()-]*$/u;
const MPN_PLACEHOLDERS = new Set(['NA', 'N/A', 'NONE', 'NULL', 'GENERIC', 'DEFAULT', 'TEST', 'NU', 'NUL']);

/** A manufacturer part number as stated by the page (2–64 characters, no placeholder), else undefined. */
export function cleanMpn(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const s = collapse(String(raw));
  if (s.length < 2 || s.length > LIMITS.mpn || hasControlChars(s) || !MPN_RE.test(s)) return undefined;
  if (MPN_PLACEHOLDERS.has(s.toUpperCase()) || /^0+$/.test(s)) return undefined;
  return s;
}

const BRAND_PLACEHOLDERS = new Set(['generic', 'generica', 'oem', 'no brand', 'nobrand', 'fara brand', 'fără brand', 'n/a', 'na', 'none', 'diverse', 'altele']);

/** A brand name (1–80 characters with a letter or digit, no placeholder), else undefined. */
export function cleanBrand(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = collapse(raw);
  if (!s || s.length > LIMITS.brand || hasControlChars(s) || !/[\p{L}\p{N}]/u.test(s)) return undefined;
  if (BRAND_PLACEHOLDERS.has(s.toLowerCase())) return undefined;
  return s;
}

/** Origin + path of a page of `shop` (https/http on the shop's own host), else undefined. */
export function shopPageUrl(raw: unknown, shop: ShopDef, base?: string): string | undefined {
  if (typeof raw !== 'string' || raw.length > LIMITS.url) return undefined;
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return undefined;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return undefined;
  if (shopForHost(u.hostname)?.id !== shop.id) return undefined;
  const out = `${u.origin}${u.pathname}`;
  return out.length <= LIMITS.url ? out : undefined;
}

/**
 * Checks a message's identifiers against the sending tab's shop and keeps only the four known
 * fields (each cleaned again). Brand and part number travel together or not at all.
 */
export function validateIds(raw: unknown, shop: ShopDef): PageIds | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => !['url', 'gtin', 'brand', 'mpn'].includes(k))) return null;
  const url = shopPageUrl(o.url, shop);
  if (!url) return null;
  const ids: PageIds = { url };
  if (o.gtin !== undefined) {
    const g = cleanGtin(o.gtin);
    if (!g) return null;
    ids.gtin = g;
  }
  if (o.brand !== undefined || o.mpn !== undefined) {
    const brand = cleanBrand(o.brand);
    const mpn = cleanMpn(o.mpn);
    if (!brand || !mpn) return null;
    ids.brand = brand;
    ids.mpn = mpn;
  }
  return ids;
}
