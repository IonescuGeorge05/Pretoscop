/**
 * An offer exactly as a page or feed showed it, before normalization (M03 produces it, M06
 * normalizes it). Strings are kept "as seen" so that normalization rules can change and be
 * replayed from raw snapshots. Defined in core so extractors (M03) and normalization (M06) share
 * one type without a dependency cycle; `@pretoscop/extractors` re-exports it.
 */
export interface RawOffer {
  /** Registry slug of the shop, e.g. `emag`. */
  shopSlug: string;
  /** Stable id of the offer inside the shop (product code, SKU, feed product id, URL path). */
  externalId: string;
  /** Canonical product URL at the shop (no tracking parameters). */
  url: string;
  title: string;
  /** Selling price as displayed, e.g. "1.234,56 lei", "1234.56" or "1.299 Lei". */
  price: string;
  /**
   * How to read `price`/`oldPrice`/`shippingCost`/`shopLowest30d`: `ro` = Romanian display format
   * (dot thousands, comma decimals), `decimal` = machine format (dot decimals, as in JSON-LD and
   * most feeds). Omit when unknown; the parser then disambiguates heuristically.
   */
  priceFormat?: 'ro' | 'decimal';
  /** Crossed-out "old" price the shop displays (the shop's reference price). */
  oldPrice?: string;
  /** ISO 4217 code as seen; RON when absent. */
  currency?: string;
  /** False when the source states prices exclude VAT ("fără TVA"); grossed up in M06. */
  vatIncluded?: boolean;
  /** Raw availability: schema.org URL, "InStock", "in stoc", "Stoc limitat", feed flag... */
  availability?: string;
  /** Raw condition: schema.org URL, "resigilat", "refurbished", "Grad A"... */
  condition?: string;
  gtin?: string;
  /** Manufacturer part number stated by the shop (structured data, feed column). */
  mpn?: string;
  /**
   * A part number guessed from the product URL, not stated by the shop (eMAG slugs end with one):
   * as often a seller SKU or an Amazon ASIN as a manufacturer code. Low trust: `normalizeOffer`
   * uses it only when neither `mpn` nor the title yields a code, and reports it as a guess
   * (`mpnSource: 'title'`, `mpnOrigin: 'url'`).
   */
  mpnHint?: string;
  brand?: string;
  /** Raw category or breadcrumb path, e.g. "Telefoane mobile > Smartphone". */
  category?: string;
  /** Seller shown for this offer (marketplace seller or the shop itself). */
  sellerName?: string;
  sellerId?: string;
  /** True when a third-party marketplace seller sells this offer (eMAG Marketplace etc.). */
  isMarketplaceSeller?: boolean;
  /** Image URL as seen. Only licensed sources (feeds, Icecat) may be stored as images (ADR-008). */
  imageUrl?: string;
  /** Affiliate deep link supplied by a network feed. */
  affiliateUrl?: string;
  shippingCost?: string;
  shippingNote?: string;
  /** The shop's own "lowest price in the last 30 days" (Omnibus), when published. */
  shopLowest30d?: string;
  /** ISO 8601 timestamp of the observation. */
  observedAt: string;
  /** Source-specific fields kept for audit and replay. */
  raw: Record<string, unknown>;
}
