import { findBrand, foldLower, isProductIndexable, normalizeMpn, VERDICT_MIN_DAYS, type Verdict } from '@pretoscop/core';

/**
 * One product as the search index stores it (docs/03 §6.6). Money is integer bani (never floats);
 * prices are those of the live offers when the document was built (the product page is the source
 * of truth; the index lags by at most the sync interval).
 */
export interface ProductDocument {
  id: number;
  slug: string;
  title: string;
  title_ascii: string;
  brand: string | null;
  brand_slug: string | null;
  /** Other spellings of the brand (from the brand dictionary), searchable. */
  aliases: string[];
  /** Leaf category slug. */
  category_slug: string | null;
  /** Leaf and ancestors, for "everything under TV și audio". */
  category_slugs: string[];
  category_names: string[];
  category_path: string | null;
  family: string | null;
  family_id: number | null;
  /** Model numbers without separators (QE55LS03HAUXXH → qe55ls03hauxxh); exact match only. */
  model_compact: string[];
  /** Spec phrases people type: "256GB", "16GB RAM", "55 inch", "negru". */
  specs: string[];
  /** GTIN-14 (filter-only: a barcode query takes the direct filter path). */
  gtins: string[];
  mpn: string | null;
  /** The few attributes result cards show. */
  attributes: Record<string, string | number | string[]>;
  /** Storage key of our own licensed image (never a shop image). */
  image: string | null;
  /** Lowest price / total (price + known delivery) among new, in-stock, live offers. */
  min_price_bani: number | null;
  min_total_bani: number | null;
  min_shop: string | null;
  /** Live offers (any stock state) and the distinct shops behind them. */
  offer_count: number;
  shop_count: number;
  shop_slugs: string[];
  in_stock: boolean;
  /** At least 14 days of observed history (the verdict threshold). */
  has_history: boolean;
  observations_days: number;
  history_started_at: string | null;
  verdict: Verdict;
  popularity: number;
  provisional: boolean;
  /** The product page may be indexed (core `isProductIndexable`). */
  indexable: boolean;
  /** Last change of a live offer's price or stock, epoch seconds. */
  last_change_at: number | null;
  updated_at: number;
  // Verified drop (M15), present only when our history supports one.
  drop_pct?: number | null;
  drop_ref_bani?: number | null;
  drop_since?: string | null;
  all_time_low?: boolean;
}

/** The database row the document is built from (see `sync.ts`). */
export interface ProductRow {
  id: number;
  slug: string;
  title: string;
  titleAscii: string;
  mpn: string | null;
  mpnNorm: string | null;
  attributes: Record<string, unknown>;
  provisional: boolean;
  popularity: number;
  brand: string | null;
  brandSlug: string | null;
  brandAliases: string[];
  categorySlug: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  parentSlug: string | null;
  parentName: string | null;
  family: string | null;
  familyId: number | null;
  image: string | null;
  gtins: string[];
  observationsDays: number;
  verdict: Verdict | null;
  historyStartedAt: string | null;
  offerCount: number;
  shopCount: number;
  shopSlugs: string[];
  minPriceBani: number | null;
  minTotalBani: number | null;
  minShop: string | null;
  inStockCount: number;
  lastChangeAt: Date | null;
  updatedAt: Date;
}

const COLOR_EN: Readonly<Record<string, string>> = {
  black: 'black', white: 'white', gray: 'gray', silver: 'silver', blue: 'blue', green: 'green', red: 'red', pink: 'pink',
  gold: 'gold', purple: 'purple', yellow: 'yellow', orange: 'orange', beige: 'beige', brown: 'brown', titanium: 'titanium',
};

const num = (a: Record<string, unknown>, k: string) => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? (a[k] as number) : null);
const str = (a: Record<string, unknown>, k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string) : null);
const decimal = (n: number) => String(n).replace('.', ',');

/** Searchable spec phrases from the extracted attributes (M06 `extractAttributes`). */
export function specPhrases(a: Record<string, unknown>): string[] {
  const out: string[] = [];
  const storage = num(a, 'storageGb');
  if (storage) out.push(storage >= 1024 && storage % 1024 === 0 ? `${storage / 1024}TB` : `${storage}GB`);
  const ram = num(a, 'ramGb');
  if (ram) out.push(`${ram}GB RAM`);
  const vram = num(a, 'vramGb');
  if (vram) out.push(`${vram}GB VRAM`);
  const screen = num(a, 'screenInches');
  if (screen) out.push(`${screen} inch`, `${decimal(screen)} inch`);
  const res = str(a, 'resolution');
  if (res) out.push(res.toUpperCase());
  const color = str(a, 'color');
  const colorRo = str(a, 'colorRo');
  if (colorRo) out.push(colorRo);
  if (color && COLOR_EN[color] && COLOR_EN[color] !== colorRo) out.push(COLOR_EN[color]!);
  const conn = a.connectivity;
  if (Array.isArray(conn)) for (const c of conn) out.push(String(c).replace('_', ' ').toUpperCase() === 'DUAL SIM' ? 'Dual SIM' : String(c).toUpperCase());
  const energy = str(a, 'energyClass');
  if (energy) out.push(`clasa ${energy}`);
  const litres = num(a, 'capacityL');
  if (litres) out.push(`${litres} litri`);
  const kg = num(a, 'capacityKg');
  if (kg) out.push(`${decimal(kg)} kg`);
  const year = num(a, 'year');
  if (year) out.push(String(year));
  const gen = str(a, 'generation');
  if (gen) out.push(gen.replace('-', ' '));
  return [...new Set(out)];
}

/** Model-number forms without separators: the MPN and alphanumeric model codes from the title. */
export function compactModels(mpn: string | null, mpnNorm: string | null, title: string): string[] {
  const out = new Set<string>();
  for (const v of [mpn, mpnNorm]) {
    const c = (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (c.length >= 4) out.add(c);
  }
  // Codes written with a separator in titles ("UE55-DU7172", "CFI-2016"): compact them too.
  for (const m of foldLower(title).matchAll(/\b([a-z0-9]+(?:[-/.][a-z0-9]+)+)\b/g)) {
    const raw = m[1]!;
    const c = raw.replace(/[^a-z0-9]/g, '');
    if (c.length >= 5 && /[a-z]/.test(c) && /\d/.test(c) && !/^\d+(gb|tb|hz|ghz|mhz|w|mah|cm|mm|kg|l)$/.test(c)) out.add(c);
  }
  return [...out];
}

/** Brand aliases from the dictionary (M06), e.g. HP → "hewlett packard". */
export function brandAliases(brand: string | null, dbAliases: readonly string[]): string[] {
  const known = brand ? findBrand(brand) : null;
  const all = [...dbAliases, ...(known?.aliases ?? [])].map((s) => s.trim()).filter(Boolean);
  const own = brand ? foldLower(brand) : '';
  return [...new Set(all)].filter((s) => foldLower(s) !== own);
}

const CARD_ATTRIBUTES = ['storageGb', 'ramGb', 'screenInches', 'resolution', 'color', 'colorRo', 'capacityL', 'capacityKg', 'energyClass'] as const;

export function buildProductDocument(r: ProductRow): ProductDocument {
  const a = r.attributes ?? {};
  const attributes: ProductDocument['attributes'] = {};
  for (const k of CARD_ATTRIBUTES) {
    const v = a[k];
    if (typeof v === 'number' || typeof v === 'string') attributes[k] = v;
  }
  const categorySlugs = [r.parentSlug, r.categorySlug].filter((s): s is string => !!s);
  const categoryNames = [r.parentName, r.categoryName].filter((s): s is string => !!s);
  const observationsDays = r.observationsDays ?? 0;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    title_ascii: r.titleAscii,
    brand: r.brand,
    brand_slug: r.brandSlug,
    aliases: brandAliases(r.brand, r.brandAliases ?? []),
    category_slug: r.categorySlug,
    category_slugs: categorySlugs,
    category_names: categoryNames,
    category_path: r.categoryPath,
    family: r.family,
    family_id: r.familyId,
    model_compact: compactModels(r.mpn, r.mpnNorm ?? normalizeMpn(r.mpn), r.title),
    specs: specPhrases(a),
    gtins: [...new Set(r.gtins ?? [])],
    mpn: r.mpn,
    attributes,
    image: r.image,
    min_price_bani: r.minPriceBani,
    min_total_bani: r.minTotalBani,
    min_shop: r.minTotalBani === null ? null : r.minShop,
    offer_count: r.offerCount,
    shop_count: r.shopCount,
    shop_slugs: [...new Set(r.shopSlugs ?? [])].sort(),
    in_stock: r.minTotalBani !== null,
    has_history: observationsDays >= VERDICT_MIN_DAYS,
    observations_days: observationsDays,
    history_started_at: r.historyStartedAt,
    verdict: r.verdict ?? 'insufficient_data',
    popularity: Math.round((r.popularity ?? 0) * 1000) / 1000,
    provisional: r.provisional,
    indexable: isProductIndexable({ provisional: r.provisional, liveOffers: r.offerCount, observationsDays }),
    last_change_at: r.lastChangeAt ? Math.floor(r.lastChangeAt.getTime() / 1000) : null,
    updated_at: Math.floor(r.updatedAt.getTime() / 1000),
  };
}
