import { cleanBrand, cleanGtin, cleanMpn, shopPageUrl, type PageIds } from './identifiers';
import type { PageDoc, PageEl } from './page';
import type { ShopDef } from './shops';

/**
 * Product detection on the page the user has open (M26). Reads, in this order, and only the fields
 * needed to recognise the product:
 *
 * 1. JSON-LD: the page's one `Product` (top level, in `@graph` or a page's `mainEntity`; never one
 *    inside an `ItemList`, related products or offers) → GTIN, `mpn`, brand, its `url`;
 * 2. microdata: the one top-level `schema.org/Product` scope → the same fields;
 * 3. shop fallbacks: Altex's `__NEXT_DATA__` product (EAN codes and brand of the object whose
 *    `url_key` is in the address), Flanco's GA4 `view_item` event (`item_brand`; `item_variant` is
 *    the manufacturer part number there);
 * 4. the address: eMAG (`/pd/<code>/`) and Altex (`/cpd/<code>/`) product URLs, the canonical link.
 *
 * Titles, prices, reviews, the user's account or cart are never read. Two different products on one
 * page are ambiguous and give no structured identifiers. After an in-page navigation (single-page
 * shops) the head may still describe the previous product, so structured data counts only when it
 * names the current address.
 */

export interface Detection {
  productPage: boolean;
  ids: PageIds | null;
  /** Where the identifiers came from: `jsonld`, `microdata`, `next-data`, `datalayer`, `url`. */
  sources: string[];
}

interface Found {
  gtin?: unknown;
  mpn?: unknown;
  brand?: unknown;
  url?: string;
}

const NONE: Detection = { productPage: false, ids: null, sources: [] };
const MAX_SCRIPT_CHARS = 2_000_000;
const MAX_NEXT_DATA_CHARS = 6_000_000;
const GTIN_KEYS = ['gtin13', 'gtin14', 'gtin12', 'gtin8', 'gtin', 'ean'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const scalar = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  const list = Array.isArray(t) ? t : [t];
  return list.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^https?:\/\/schema\.org\//i, '').toLowerCase());
}

/** JSON as written by shops: raw control characters (line breaks inside strings) are turned into spaces first when needed. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      // eslint-disable-next-line no-control-regex -- matching raw control characters is the point
      return JSON.parse(text.replace(/[\x00-\x1f]+/g, ' '));
    } catch {
      return undefined;
    }
  }
}

function collectProducts(v: unknown, out: Array<Record<string, unknown>>, depth: number): void {
  if (depth > 6) return;
  if (Array.isArray(v)) {
    for (const x of v) collectProducts(x, out, depth + 1);
    return;
  }
  if (!isObj(v)) return;
  if (typesOf(v).includes('product')) {
    out.push(v);
    return;
  }
  if ('@graph' in v) collectProducts(v['@graph'], out, depth + 1);
  if ('mainEntity' in v) collectProducts(v.mainEntity, out, depth + 1);
}

function nameOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return nameOf(v[0]);
  if (isObj(v)) return scalar(v.name);
  return undefined;
}

function fromJsonLd(node: Record<string, unknown>, base: string): Found {
  let url: string | undefined;
  const rawUrl = scalar(node.url);
  if (rawUrl) {
    try {
      url = new URL(rawUrl, base).href;
    } catch {
      url = undefined;
    }
  }
  return {
    gtin: GTIN_KEYS.map((k) => scalar(node[k])).find((g) => cleanGtin(g) !== undefined),
    mpn: scalar(node.mpn),
    brand: nameOf(node.brand),
    url,
  };
}

/** The page's JSON-LD Product nodes (see the module comment for which ones count). */
export function jsonLdProducts(page: PageDoc): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const el of page.find('script[type="application/ld+json"]')) {
    const text = el.text();
    if (!text || text.length > MAX_SCRIPT_CHARS) continue;
    collectProducts(parseJson(text.trim()), out, 0);
  }
  return out;
}

/**
 * One product, or null when the nodes describe more than one (or none). Several nodes count as one
 * product when no field contradicts another (a theme's minimal `Product` next to the full one):
 * their valid fields are combined. Two different GTINs, part numbers, brands or addresses are two
 * products.
 */
function single(found: Found[]): Found | null {
  if (found.length === 0) return null;
  const out: Found = {};
  const fields: Array<[keyof Found, (v: unknown) => string | undefined]> = [
    ['gtin', cleanGtin],
    ['mpn', (v) => cleanMpn(v)?.toUpperCase()],
    ['brand', (v) => cleanBrand(v)?.toLowerCase()],
    ['url', (v) => (typeof v === 'string' ? pathKey(v) : undefined)],
  ];
  for (const [field, norm] of fields) {
    let seen: string | undefined;
    for (const f of found) {
      const n = norm(f[field]);
      if (n === undefined) continue;
      if (seen !== undefined && n !== seen) return null;
      if (seen === undefined) {
        seen = n;
        (out as Record<string, unknown>)[field] = f[field];
      }
    }
  }
  return out;
}

function propValue(el: PageEl): string {
  return el.attr('content') ?? el.attr('href') ?? el.text();
}

const PRODUCT_TYPE = /^https?:\/\/schema\.org\/Product$/i;

/** The one top-level microdata Product (not inside an ItemList or another Product), its own properties only. */
function microdataProduct(page: PageDoc): Found | null {
  const scopes = page.find('[itemscope][itemtype]').filter((el) => PRODUCT_TYPE.test((el.attr('itemtype') ?? '').trim().split(/\s+/)[0] ?? ''));
  const top = scopes.filter(
    (s) => !s.closest('[itemtype*="ItemList"]') && !scopes.some((t) => !t.same(s) && t.find('[itemscope]').some((x) => x.same(s))),
  );
  if (top.length !== 1) return null;
  const scope = top[0]!;
  const nested = scope.find('[itemscope]');
  const own = (name: string) =>
    scope
      .find(`[itemprop~="${name}"]`)
      .filter((p) => !nested.some((n) => !n.same(p) && n.find(`[itemprop~="${name}"]`).some((x) => x.same(p))));
  const first = (name: string) => {
    const el = own(name)[0];
    return el ? propValue(el).trim() : undefined;
  };
  const brandEl = own('brand')[0];
  let brand: string | undefined;
  if (brandEl) {
    const nameEl = brandEl.attr('itemscope') !== null ? brandEl.find('[itemprop~="name"]')[0] : undefined;
    brand = (nameEl ? propValue(nameEl) : propValue(brandEl)).trim();
  }
  return {
    gtin: GTIN_KEYS.map(first).find((g) => cleanGtin(g) !== undefined),
    mpn: first('mpn'),
    brand,
    url: first('url'),
  };
}

/**
 * Altex (Next.js): the product object in `__NEXT_DATA__` whose `url_key` is a segment of the
 * address, with its EAN codes and brand (the listing pages' documented fields, docs/research/notes/
 * gaps2_retailers.md §3). Only read when the JSON-LD gives no GTIN.
 */
function nextDataProduct(page: PageDoc, path: string): Found | null {
  const el = page.find('script#__NEXT_DATA__')[0];
  const text = el?.text();
  if (!text || text.length > MAX_NEXT_DATA_CHARS) return null;
  const root = parseJson(text);
  const segments = new Set(path.split('/').filter(Boolean).map((s) => decodeURIComponentSafe(s).toLowerCase()));
  const hits = new Map<string, Record<string, unknown>>();
  // Breadth-first over at most 200,000 values (an index instead of shift(): no quadratic copying).
  const queue: unknown[] = [root];
  for (let i = 0; i < queue.length && i < 200_000; i++) {
    const v = queue[i];
    const children = Array.isArray(v) ? v : isObj(v) ? Object.values(v) : [];
    if (isObj(v)) {
      const key = scalar(v.url_key);
      if (key && 'ean_codes' in v && segments.has(key.toLowerCase())) hits.set(key.toLowerCase(), v);
    }
    for (const x of children) if (x && typeof x === 'object' && queue.length < 200_000) queue.push(x);
  }
  if (hits.size !== 1) return null;
  const p = [...hits.values()][0]!;
  const codes = Array.isArray(p.ean_codes) ? p.ean_codes.map(scalar) : (scalar(p.ean_codes) ?? '').split(/[,;\s]+/);
  return { gtin: codes.find((c) => cleanGtin(c) !== undefined), brand: scalar(p.brand_name) };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The JSON object that encloses `index` in `text` (string-aware brace matching), or null. */
function enclosingObject(text: string, index: number): string | null {
  let tries = 0;
  for (let start = text.lastIndexOf('{', index); start >= 0 && tries < 200; start = text.lastIndexOf('{', start - 1), tries++) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < text.length; i++) {
      const c = text[i]!;
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        if (i > index) return text.slice(start, i + 1);
        break;
      }
    }
  }
  return null;
}

/** Flanco (Magento 2): the GA4 `view_item` event of the product page, when it has exactly one item. */
function ga4ViewItem(page: PageDoc): Found | null {
  for (const el of page.find('script:not([src])')) {
    const text = el.text();
    if (text.length > MAX_SCRIPT_CHARS || !text.includes('view_item')) continue;
    const at = text.search(/["']event["']\s*:\s*["']view_item["']/);
    if (at < 0) continue;
    const obj = enclosingObject(text, at);
    const data = obj ? parseJson(obj) : undefined;
    const items = isObj(data) && isObj(data.ecommerce) ? data.ecommerce.items : undefined;
    if (!Array.isArray(items) || items.length !== 1 || !isObj(items[0])) continue;
    return { brand: scalar(items[0].item_brand), mpn: scalar(items[0].item_variant) };
  }
  return null;
}

/** Host + path of an absolute URL, compared without `www.`, case or trailing slashes; undefined when not a URL. */
function pathKey(u: string): string | undefined {
  try {
    const x = new URL(u);
    return `${x.hostname.toLowerCase().replace(/^www\./, '')}${decodeURIComponentSafe(x.pathname).replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return undefined;
  }
}

function samePath(a: string, b: string): boolean {
  const ka = pathKey(a);
  return ka !== undefined && ka === pathKey(b);
}

/** Is this a product page of `shop`, and which identifiers does it give? */
export function detectProduct(page: PageDoc, shop: ShopDef, opts: { afterNavigation?: boolean } = {}): Detection {
  const here = shopPageUrl(page.url, shop);
  if (!here) return NONE;
  const path = new URL(here).pathname;
  const byPath = shop.productPath?.test(path) ?? false;
  const sources: string[] = [];
  let found: Found | null = null;

  const ld = single(jsonLdProducts(page).map((n) => fromJsonLd(n, here)));
  if (ld && (!opts.afterNavigation || (ld.url !== undefined && samePath(ld.url, here)))) {
    found = ld;
    sources.push('jsonld');
  }
  if (!found && !opts.afterNavigation) {
    const md = microdataProduct(page);
    if (md) {
      found = md;
      sources.push('microdata');
    }
  }
  if (shop.id === 'altex' && cleanGtin(found?.gtin) === undefined) {
    const nd = nextDataProduct(page, path);
    if (nd) {
      found = { ...nd, ...Object.fromEntries(Object.entries(found ?? {}).filter(([, v]) => v !== undefined)) };
      sources.push('next-data');
    }
  }
  if (shop.id === 'flanco' && !opts.afterNavigation && (cleanMpn(found?.mpn) === undefined || cleanBrand(found?.brand) === undefined)) {
    const dl = ga4ViewItem(page);
    if (dl) {
      found = { ...found, brand: cleanBrand(found?.brand) ?? dl.brand, mpn: cleanMpn(found?.mpn) ?? dl.mpn };
      sources.push('datalayer');
    }
  }
  if (!byPath && !found) return NONE;

  let url = here;
  if (!opts.afterNavigation) {
    const href = page.find('link[rel~="canonical"]')[0]?.attr('href');
    const canonical = href ? shopPageUrl(href, shop, page.url) : undefined;
    // The shop's own canonical address, unless it no longer looks like this kind of page.
    if (canonical && (!byPath || shop.productPath!.test(new URL(canonical).pathname))) url = canonical;
  }
  sources.push('url');
  const ids: PageIds = { url };
  const gtin = cleanGtin(found?.gtin);
  if (gtin) ids.gtin = gtin;
  const brand = cleanBrand(found?.brand);
  const mpn = cleanMpn(found?.mpn);
  if (brand && mpn) {
    ids.brand = brand;
    ids.mpn = mpn;
  }
  return { productPage: true, ids, sources };
}
