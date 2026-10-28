/**
 * schema.org builders (docs/03 §7.3, M16) and a validator for the tests. Pure functions: every URL
 * is made absolute from `base` (PUBLIC_BASE_URL). Prices are the strings of numeric(12,2) columns,
 * never floats.
 */

export function absoluteUrl(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

const CTX = 'https://schema.org';

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export function breadcrumbList(base: string, items: BreadcrumbItem[]) {
  return {
    '@context': CTX,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(base, c.href) })),
  };
}

/**
 * Summary-page ItemList (category, brand, deals pages): one ListItem per product URL, positions
 * continuing across pages. Only indexable product pages belong in it.
 */
export function itemList(base: string, name: string, hrefs: string[], startPosition = 1) {
  return {
    '@context': CTX,
    '@type': 'ItemList',
    name,
    numberOfItems: hrefs.length,
    itemListElement: hrefs.map((href, i) => ({ '@type': 'ListItem', position: startPosition + i, url: absoluteUrl(base, href) })),
  };
}

export function organization(base: string) {
  return {
    '@context': CTX,
    '@type': 'Organization',
    '@id': absoluteUrl(base, '/#organization'),
    name: 'Pretoscop',
    url: absoluteUrl(base, '/'),
    logo: absoluteUrl(base, '/icon.svg'),
    description: 'Comparator de prețuri pentru magazinele online din România, cu prețul total (preț + livrare) și istoricul prețurilor observate.',
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: absoluteUrl(base, '/contact'), availableLanguage: 'ro' },
  };
}

/** WebSite with a SearchAction (the home page). */
export function website(base: string) {
  return {
    '@context': CTX,
    '@type': 'WebSite',
    '@id': absoluteUrl(base, '/#website'),
    name: 'Pretoscop',
    url: absoluteUrl(base, '/'),
    inLanguage: 'ro-RO',
    publisher: { '@id': absoluteUrl(base, '/#organization') },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl(base, '/cauta')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface ProductLdOffer {
  /** Item price (numeric(12,2) string). */
  price: string;
  total: string;
  shippingCost: string | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  condition: 'new' | 'refurbished' | 'used';
  /** The shop's product page. */
  url: string;
  seller: string;
  stale: boolean;
}

export interface ProductLdInput {
  path: string;
  title: string;
  brand: string | null;
  mpn: string | null;
  gtins: string[];
  category: string | null;
  images: string[];
  offers: ProductLdOffer[];
}

const AVAILABILITY: Record<ProductLdOffer['availability'], string> = {
  in_stock: 'https://schema.org/InStock',
  out_of_stock: 'https://schema.org/OutOfStock',
  preorder: 'https://schema.org/PreOrder',
  unknown: 'https://schema.org/LimitedAvailability',
};
const CONDITION: Record<ProductLdOffer['condition'], string> = {
  new: 'https://schema.org/NewCondition',
  refurbished: 'https://schema.org/RefurbishedCondition',
  used: 'https://schema.org/UsedCondition',
};

/** GTIN-14 → the most specific schema.org property (gtin13 for EAN-13, gtin12 for UPC, gtin8). */
export function gtinProperty(gtin14: string): Record<string, string> {
  if (!/^\d{14}$/.test(gtin14)) return {};
  if (gtin14.startsWith('000000')) return { gtin8: gtin14.slice(6) };
  if (gtin14.startsWith('00')) return { gtin12: gtin14.slice(2) };
  if (gtin14.startsWith('0')) return { gtin13: gtin14.slice(1) };
  return { gtin14 };
}

const cents = (s: string) => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : NaN;
};
const money = (s: string) => {
  const c = cents(s);
  return Number.isNaN(c) ? s : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
};

/**
 * Product page (variant) JSON-LD: brand, GTIN/MPN, licensed images, and the live offers as one
 * AggregateOffer (low/high of in-stock item prices, offer count) with up to 10 Offers carrying
 * seller, availability, condition and the known delivery cost. `priceValidUntil` is omitted: our
 * prices are observations, not promises. Stale offers are left out.
 */
export function productJsonLd(base: string, p: ProductLdInput) {
  const url = absoluteUrl(base, p.path);
  const live = p.offers.filter((o) => !o.stale).sort((a, b) => cents(a.total) - cents(b.total));
  const priced = live.filter((o) => o.availability === 'in_stock');
  const gtin = p.gtins.map(gtinProperty).find((g) => Object.keys(g).length) ?? {};
  const offers = live.slice(0, 10).map((o) => ({
    '@type': 'Offer',
    price: money(o.price),
    priceCurrency: 'RON',
    availability: AVAILABILITY[o.availability],
    itemCondition: CONDITION[o.condition],
    url: o.url,
    seller: { '@type': 'Organization', name: o.seller },
    ...(o.shippingCost !== null
      ? {
          shippingDetails: {
            '@type': 'OfferShippingDetails',
            shippingRate: { '@type': 'MonetaryAmount', value: money(o.shippingCost), currency: 'RON' },
            shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'RO' },
          },
        }
      : {}),
  }));
  const prices = priced.map((o) => cents(o.price)).filter((c) => !Number.isNaN(c));
  const fmt = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
  return {
    '@context': CTX,
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.title,
    url,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.mpn ? { mpn: p.mpn } : {}),
    ...gtin,
    ...(p.category ? { category: p.category } : {}),
    ...(p.images.length ? { image: p.images.map((i) => absoluteUrl(base, i)) } : {}),
    ...(prices.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'RON',
            lowPrice: fmt(Math.min(...prices)),
            highPrice: fmt(Math.max(...prices)),
            offerCount: live.length,
            offers,
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Validation (tests and e2e): the properties Google requires or recommends for these types.

type Json = Record<string, unknown>;
const isAbs = (v: unknown) => typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v);
const isMoney = (v: unknown) => typeof v === 'string' && /^\d+\.\d{2}$/.test(v);

export function validateStructuredData(input: unknown): string[] {
  const issues: string[] = [];
  const list = Array.isArray(input) ? input : [input];
  for (const raw of list) {
    const d = raw as Json;
    const t = d['@type'];
    if (d['@context'] !== CTX) issues.push(`${String(t)}: @context must be ${CTX}`);
    if (t === 'Product') {
      if (typeof d.name !== 'string' || !d.name) issues.push('Product: name missing');
      if (!isAbs(d.url)) issues.push('Product: url must be absolute');
      const brand = d.brand as Json | undefined;
      if (brand && (brand['@type'] !== 'Brand' || typeof brand.name !== 'string')) issues.push('Product: brand must be a Brand with a name');
      for (const k of ['gtin8', 'gtin12', 'gtin13', 'gtin14'] as const) {
        if (d[k] !== undefined && !new RegExp(`^\\d{${k.slice(4)}}$`).test(String(d[k]))) issues.push(`Product: ${k} must have ${k.slice(4)} digits`);
      }
      if (d.image !== undefined && !(Array.isArray(d.image) && d.image.every(isAbs))) issues.push('Product: image must be absolute URLs');
      if (d.offers !== undefined) {
        const a = d.offers as Json;
        if (a['@type'] !== 'AggregateOffer') issues.push('Product: offers must be an AggregateOffer');
        if (a.priceCurrency !== 'RON') issues.push('AggregateOffer: priceCurrency must be RON');
        if (!isMoney(a.lowPrice) || !isMoney(a.highPrice)) issues.push('AggregateOffer: lowPrice/highPrice must be prices with two decimals');
        else if (Number(a.lowPrice) > Number(a.highPrice)) issues.push('AggregateOffer: lowPrice above highPrice');
        if (!Number.isInteger(a.offerCount) || (a.offerCount as number) < 1) issues.push('AggregateOffer: offerCount must be a positive integer');
        const offers = a.offers as Json[] | undefined;
        if (!Array.isArray(offers) || offers.length === 0 || offers.length > 10) issues.push('AggregateOffer: 1–10 offers expected');
        for (const o of offers ?? []) {
          if (o['@type'] !== 'Offer') issues.push('Offer: wrong @type');
          if (!isMoney(o.price) || o.priceCurrency !== 'RON') issues.push('Offer: price/priceCurrency');
          if (typeof o.availability !== 'string' || !o.availability.startsWith('https://schema.org/')) issues.push('Offer: availability');
          if (typeof o.itemCondition !== 'string' || !o.itemCondition.startsWith('https://schema.org/')) issues.push('Offer: itemCondition');
          if (!isAbs(o.url)) issues.push('Offer: url must be absolute');
          if (typeof (o.seller as Json | undefined)?.name !== 'string') issues.push('Offer: seller name missing');
          if (o.priceValidUntil !== undefined) issues.push('Offer: priceValidUntil must be omitted');
          const ship = o.shippingDetails as Json | undefined;
          if (ship && (!isMoney((ship.shippingRate as Json)?.value) || (ship.shippingDestination as Json)?.addressCountry !== 'RO')) issues.push('Offer: shippingDetails');
        }
      }
    } else if (t === 'BreadcrumbList') {
      const items = d.itemListElement as Json[] | undefined;
      if (!Array.isArray(items) || items.length === 0) issues.push('BreadcrumbList: no items');
      items?.forEach((it, i) => {
        if (it.position !== i + 1) issues.push('BreadcrumbList: positions must be 1..n');
        if (typeof it.name !== 'string' || !it.name) issues.push('BreadcrumbList: item name missing');
        if (!isAbs(it.item)) issues.push('BreadcrumbList: item must be an absolute URL');
      });
    } else if (t === 'ItemList') {
      const items = d.itemListElement as Json[] | undefined;
      if (!Array.isArray(items) || items.length === 0) issues.push('ItemList: no items');
      if (d.numberOfItems !== items?.length) issues.push('ItemList: numberOfItems mismatch');
      items?.forEach((it, i) => {
        if (i > 0 && it.position !== (items[i - 1]!.position as number) + 1) issues.push('ItemList: positions must be consecutive');
        if (!isAbs(it.url)) issues.push('ItemList: url must be absolute');
      });
    } else if (t === 'Organization') {
      if (d.name !== 'Pretoscop' || !isAbs(d.url) || !isAbs(d.logo)) issues.push('Organization: name, url and logo required');
    } else if (t === 'WebSite') {
      const action = d.potentialAction as Json | undefined;
      const template = (action?.target as Json | undefined)?.urlTemplate;
      if (!isAbs(d.url)) issues.push('WebSite: url must be absolute');
      if (action?.['@type'] !== 'SearchAction' || typeof template !== 'string' || !template.includes('{search_term_string}')) issues.push('WebSite: SearchAction target');
      if (action?.['query-input'] !== 'required name=search_term_string') issues.push('WebSite: query-input');
    } else {
      issues.push(`unexpected @type ${String(t)}`);
    }
  }
  return issues;
}
