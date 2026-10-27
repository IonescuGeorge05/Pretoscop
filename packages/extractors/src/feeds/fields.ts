/**
 * Column/element alias table used by the CSV and XML mappers. Keys are canonical RawOffer-ish
 * fields; values are lower-cased header names seen in Romanian feeds (2Performant, Google Merchant,
 * compari.ro, Skroutz-style, shop exports). Matching ignores case, spaces, underscores and dashes.
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  externalId: ['id', 'g:id', 'product id', 'productid', 'identifier', 'sku', 'cod produs', 'cod', 'item id', 'unique id', 'product_id'],
  title: ['title', 'g:title', 'product title', 'name', 'product name', 'productname', 'nume', 'denumire', 'titlu', 'titlu produs'],
  price: ['sale price', 'price', 'g:price', 'pret', 'preț', 'pret final', 'pret vanzare', 'price with vat', 'pret cu tva'],
  // Google's sale_price only with its g: prefix: plain "sale price" is 2Performant's selling price.
  salePrice: ['g:sale_price', 'pret redus', 'pret promotional'],
  oldPrice: ['old price', 'old_price', 'pret vechi', 'pret initial', 'list price', 'regular price', 'pret intreg'],
  url: ['product url', 'url', 'link', 'g:link', 'producturl', 'product link', 'url produs'],
  affiliateUrl: ['marketer link', 'affiliate link', 'affiliate url', 'deeplink', 'tracking link'],
  brand: ['brand', 'g:brand', 'manufacturer', 'producator', 'producător', 'marca'],
  category: ['category', 'g:product_type', 'product_type', 'categorie', 'category path', 'google_product_category', 'g:google_product_category'],
  gtin: ['gtin', 'g:gtin', 'ean', 'eancode', 'ean code', 'barcode', 'isbn', 'cod ean', 'upc'],
  mpn: ['mpn', 'g:mpn', 'productnumber', 'product number', 'part number', 'cod producator', 'model'],
  availability: ['availability', 'g:availability', 'stock', 'stoc', 'disponibilitate', 'in stock', 'in_stock'],
  condition: ['condition', 'g:condition', 'stare'],
  imageUrl: ['image urls', 'image url', 'image_link', 'g:image_link', 'imageurl', 'image', 'imagine'],
  shippingCost: ['deliverycost', 'delivery cost', 'delivery_cost', 'shipping', 'shipping cost', 'cost livrare', 'transport'],
  shippingNote: ['deliverytime', 'delivery time', 'delivery_time', 'termen livrare'],
  currency: ['currency', 'moneda', 'valuta'],
  active: ['active', 'activ', 'is active'],
  vat: ['vat', 'tva', 'vat included', 'price includes vat'],
};

export function normHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/[\s_\-.]+/g, ' ')
    .trim();
}

const LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) {
      const key = normHeader(a);
      const existing = m.get(key);
      if (existing && existing !== field) throw new Error(`feed alias "${a}" maps to ${existing} and ${field}`);
      m.set(key, field);
    }
  }
  return m;
})();

/** Maps a header to its canonical field, or undefined. */
export function canonicalField(header: string): string | undefined {
  return LOOKUP.get(normHeader(header));
}

/** Picks canonical fields from a record with arbitrary headers (first non-empty wins). */
export function pickFields(rec: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined || v.trim() === '') continue;
    const f = canonicalField(k);
    if (f && out[f] === undefined) out[f] = v.trim();
  }
  return out;
}

/** Truthy values of feed flags: 1, true, yes, da, y. */
export function flagTrue(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const t = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'da', 'y', 'activ', 'active'].includes(t)) return true;
  if (['0', 'false', 'no', 'nu', 'n', 'inactiv', 'inactive'].includes(t)) return false;
  return undefined;
}

/** "1234.56 RON" → { amount: "1234.56", currency: "RON" } (Google Merchant price syntax). */
export function splitPriceCurrency(v: string | undefined): { amount?: string; currency?: string } {
  if (!v) return {};
  const m = /^\s*([\d.,\s]+)\s*([A-Za-z]{3})?\s*$/.exec(v);
  if (!m) return { amount: v.trim() };
  return { amount: (m[1] ?? '').replace(/\s+/g, ''), currency: m[2]?.toUpperCase() };
}
