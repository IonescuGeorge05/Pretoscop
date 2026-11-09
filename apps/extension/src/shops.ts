/**
 * The shops whose product pages the extension reads (M26 scope). `matches` must equal the
 * manifest's content-script patterns (a unit test checks it); `domain` is our `shops.domain`.
 */
export type ShopId = 'emag' | 'altex' | 'flanco' | 'pcgarage' | 'evomag';

export interface ShopDef {
  id: ShopId;
  name: string;
  domain: string;
  /** Content-script match patterns. */
  matches: readonly string[];
  /**
   * A product page by its path alone (eMAG `/…/pd/<code>/`, Altex `/…/cpd/<code>/`); null when only
   * the page's structured data can tell (Flanco, PC Garage and evoMAG category and product URLs
   * look alike).
   */
  productPath: RegExp | null;
}

export const SHOPS: readonly ShopDef[] = [
  { id: 'emag', name: 'eMAG', domain: 'emag.ro', matches: ['https://www.emag.ro/*'], productPath: /\/pd\/[A-Z0-9]{6,12}(?:\/|$)/ },
  { id: 'altex', name: 'Altex', domain: 'altex.ro', matches: ['https://altex.ro/*', 'https://www.altex.ro/*'], productPath: /\/cpd\/[A-Za-z0-9]{3,24}(?:\/|$)/ },
  { id: 'flanco', name: 'Flanco', domain: 'flanco.ro', matches: ['https://www.flanco.ro/*'], productPath: null },
  { id: 'pcgarage', name: 'PC Garage', domain: 'pcgarage.ro', matches: ['https://www.pcgarage.ro/*'], productPath: null },
  { id: 'evomag', name: 'evoMAG', domain: 'evomag.ro', matches: ['https://www.evomag.ro/*'], productPath: null },
];

/** The shop of a host name (`www.emag.ro` → eMAG); only the shop's own host and its `www.` form. */
export function shopForHost(hostname: string): ShopDef | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return SHOPS.find((s) => host === s.domain || host === `www.${s.domain}`) ?? null;
}

export function shopById(id: unknown): ShopDef | null {
  return SHOPS.find((s) => s.id === id) ?? null;
}
