import type { CheerioAPI } from 'cheerio';
import { asArray, decodeEntities, isRecord, lenientJsonParse, nonEmpty, str } from '../util';

/** One offer of a schema.org Product, values as found (strings). */
export interface SdOffer {
  price?: string;
  priceRaw?: unknown;
  oldPrice?: string;
  priceCurrency?: string;
  availability?: string;
  itemCondition?: string;
  sellerName?: string;
  url?: string;
  sku?: string;
  gtin?: string;
  shippingCost?: string;
  /** AggregateOffer bounds (only used when they collapse to one price). */
  lowPrice?: string;
  highPrice?: string;
  offerCount?: number;
}

/** A schema.org Product found in JSON-LD or microdata. */
export interface SdProduct {
  source: 'jsonld' | 'microdata' | 'opengraph';
  name?: string;
  sku?: string;
  mpn?: string;
  productId?: string;
  gtin?: string;
  brand?: string;
  category?: string;
  url?: string;
  itemCondition?: string;
  offers: SdOffer[];
}

const PRODUCT_TYPES = new Set(['product', 'productgroup', 'individualproduct', 'productmodel', 'vehicle']);
const GTIN_KEYS = ['gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8', 'ean', 'isbn'];

function typesOf(node: Record<string, unknown>): string[] {
  return asArray(node['@type'] as string | string[] | undefined).map((t) =>
    String(t).replace(/^https?:\/\/schema\.org\//i, '').toLowerCase(),
  );
}

/** A display text from JSON-LD (name, brand, category), with stray HTML entities decoded. */
function sdText(v: unknown): string | undefined {
  const s = str(v);
  return s === undefined ? undefined : nonEmpty(decodeEntities(s));
}

function nameOf(v: unknown): string | undefined {
  if (typeof v === 'string') return nonEmpty(decodeEntities(v));
  if (Array.isArray(v)) return nameOf(v[0]);
  if (isRecord(v)) return sdText(v.name) ?? str(v['@id']);
  return undefined;
}

function gtinOf(node: Record<string, unknown>): string | undefined {
  for (const k of GTIN_KEYS) {
    const v = str(node[k]);
    if (v) return v;
  }
  // productID like "ean:5901234123457" or "isbn:..."
  const pid = str(node.productID);
  const m = pid ? /^(?:ean|gtin\d*|isbn):?\s*(\d{8,14})$/i.exec(pid) : null;
  return m?.[1];
}

function isStrikethrough(spec: Record<string, unknown>): boolean {
  const t = String(spec.priceType ?? '').toLowerCase();
  return t.includes('strikethrough') || t.includes('listprice') || t.includes('srp') || t.includes('msrp');
}

function offerFrom(node: Record<string, unknown>): SdOffer[] {
  const types = typesOf(node);
  if (types.includes('aggregateoffer')) {
    const nested = asArray(node.offers as unknown).filter(isRecord).flatMap(offerFrom);
    if (nested.length > 0) return nested;
    const low = str(node.lowPrice) ?? str(node.price);
    const high = str(node.highPrice);
    const count = Number(node.offerCount ?? NaN);
    return [
      {
        price: low,
        priceRaw: node.lowPrice ?? node.price,
        lowPrice: low,
        highPrice: high,
        offerCount: Number.isFinite(count) ? count : undefined,
        priceCurrency: str(node.priceCurrency),
        availability: str(node.availability),
      },
    ];
  }
  let price = str(node.price);
  let priceRaw: unknown = node.price;
  let oldPrice: string | undefined;
  for (const spec of asArray(node.priceSpecification as unknown).filter(isRecord)) {
    const p = str(spec.price);
    if (!p) continue;
    if (isStrikethrough(spec)) oldPrice ??= p;
    else if (!price) {
      price = p;
      priceRaw = spec.price;
    }
  }
  let shippingCost: string | undefined;
  for (const sd of asArray(node.shippingDetails as unknown).filter(isRecord)) {
    const rate = isRecord(sd.shippingRate) ? sd.shippingRate : undefined;
    const v = rate ? str(rate.value) : undefined;
    if (v !== undefined) {
      shippingCost = v;
      break;
    }
  }
  return [
    {
      price,
      priceRaw,
      oldPrice,
      priceCurrency: str(node.priceCurrency),
      availability: str(node.availability),
      itemCondition: str(node.itemCondition),
      sellerName: nameOf(node.seller),
      url: str(node.url),
      sku: str(node.sku),
      gtin: gtinOf(node),
      shippingCost,
    },
  ];
}

function productFrom(node: Record<string, unknown>): SdProduct[] {
  const base: SdProduct = {
    source: 'jsonld',
    name: sdText(node.name),
    sku: str(node.sku),
    mpn: str(node.mpn),
    productId: str(node.productID),
    gtin: gtinOf(node),
    brand: nameOf(node.brand) ?? nameOf(node.manufacturer),
    category: nameOf(node.category),
    url: str(node.url) ?? str(node['@id']),
    itemCondition: str(node.itemCondition),
    offers: asArray(node.offers as unknown).filter(isRecord).flatMap(offerFrom),
  };
  // ProductGroup: each variant is a product of its own.
  const variants = asArray(node.hasVariant as unknown).filter(isRecord);
  if (variants.length > 0) {
    return variants.flatMap((v) =>
      productFrom(v).map((p) => ({
        ...p,
        brand: p.brand ?? base.brand,
        category: p.category ?? base.category,
        name: p.name ?? base.name,
      })),
    );
  }
  return [base];
}

/** Walks a parsed JSON-LD value and collects every Product (incl. @graph, ItemList, mainEntity). */
export function collectProducts(value: unknown, out: SdProduct[] = [], depth = 0): SdProduct[] {
  if (depth > 8) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectProducts(v, out, depth + 1);
    return out;
  }
  if (!isRecord(value)) return out;
  if (Array.isArray(value['@graph'])) collectProducts(value['@graph'], out, depth + 1);
  const types = typesOf(value);
  if (types.some((t) => PRODUCT_TYPES.has(t))) {
    out.push(...productFrom(value));
    return out;
  }
  if (value.mainEntity) collectProducts(value.mainEntity, out, depth + 1);
  if (types.includes('itemlist')) {
    for (const li of asArray(value.itemListElement as unknown).filter(isRecord)) {
      collectProducts(li.item ?? li, out, depth + 1);
    }
  }
  return out;
}

/** Every Product in the page's `<script type="application/ld+json">` blocks. */
export function extractJsonLd($: CheerioAPI): SdProduct[] {
  const out: SdProduct[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text();
    if (!text.trim()) return;
    const parsed = lenientJsonParse(text);
    if (parsed !== undefined) collectProducts(parsed, out);
  });
  return out;
}

/** Breadcrumb names from JSON-LD BreadcrumbList, joined with " > ". */
export function extractBreadcrumb($: CheerioAPI): string | undefined {
  let best: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const parsed = lenientJsonParse($(el).text());
    const nodes = asArray(parsed as unknown).flatMap((n) =>
      isRecord(n) && Array.isArray(n['@graph']) ? (n['@graph'] as unknown[]) : [n],
    );
    for (const n of nodes) {
      if (!isRecord(n) || !typesOf(n).includes('breadcrumblist')) continue;
      const names = asArray(n.itemListElement as unknown)
        .filter(isRecord)
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
        .map((li) => str(li.name) ?? (isRecord(li.item) ? nameOf(li.item) : undefined))
        .filter((x): x is string => !!x);
      if (names.length > best.length) best = names;
    }
  });
  return best.length > 0 ? best.join(' > ') : undefined;
}
