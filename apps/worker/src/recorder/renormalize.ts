import { sql } from 'drizzle-orm';
import { ACCEPT_AT, type MatchSide, normalizeOffer, type RawOffer, scorePair } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import { type Db, slugPart } from '@pretoscop/db';
import { isUrlDerivedMpn, urlMpnHint } from '@pretoscop/extractors';
import { offerIdentity } from './identity';

/**
 * Re-normalization of stored offers with the current normalizer (M06), after a rule change.
 *
 * Each offer's RawOffer is rebuilt from its stored raw columns (title, brand, MPN and GTIN fields,
 * breadcrumb, price, availability, condition, seller), normalized again, and its normalized
 * columns are overwritten: title forms, brand, MPN (value, raw field, source), GTIN-14,
 * attributes (replaced, not merged), bundle and accessory flags, identity hash. The recorder's
 * upsert cannot do this: it keeps a stored field MPN over any later guess and COALESCEs brand,
 * GTIN and attributes, so stale values from earlier rules would stay forever.
 *
 * An MPN field that is really the eMAG URL slug tail (stored before slugs became hints) is passed
 * as `mpnHint`, so it becomes a guess (`mpn_source = 'title'`) or yields to a title code.
 *
 * Products the matcher created copy the MPN, brand and attributes of the offer they came from, so
 * they follow it (never products created or edited by a human):
 * - a product whose only offer is this one is that offer's projection: its MPN, brand and
 *   attributes take the offer's new values (its family is cleared when the brand changes) and
 *   the link is kept, so re-matching never duplicates it;
 * - a product with several offers whose MPN *field* is this offer's slug tail takes the offer's
 *   new MPN; the offer keeps its link when it still clears the accept bar against the product.
 *
 * Offers whose identity hash changes go back to `pending` (the matcher re-matches them) unless a
 * human decided their mapping (an `offer_aliases` row, `match_status` 'manual' or 'rejected', a
 * blacklisted offer) or their current link still holds (above). Prices, price events and history
 * are never touched. An offer updated by the recorder since it was read is skipped (`raced`); run
 * again to pick it up.
 */

export type RenormalizedColumn =
  | 'title'
  | 'brand'
  | 'mpn'
  | 'mpnRaw'
  | 'mpnSource'
  | 'gtin'
  | 'attributes'
  | 'bundle'
  | 'accessory';

export interface Distribution {
  mpnField: number;
  mpnTitle: number;
  mpnNone: number;
  noBrand: number;
  bundles: number;
  accessories: number;
}

export interface OfferChange {
  id: number;
  shopSlug: string;
  title: string;
  changes: Partial<Record<RenormalizedColumn, [unknown, unknown]>>;
  identityChanged: boolean;
  requeued: boolean;
  /** The linked product was updated to follow this offer. */
  productSynced: number | null;
}

export interface RenormalizeSummary {
  dryRun: boolean;
  scanned: number;
  /** The rebuilt offer was rejected by the normalizer (left as stored). */
  rejected: number;
  /** Offers with at least one normalized column changed. */
  changed: number;
  columns: Record<RenormalizedColumn, number>;
  identityChanged: number;
  /** Identity changed: put back to `pending` for the matcher. */
  requeued: number;
  /** Identity changed but a human decision keeps the mapping. */
  locked: number;
  /** Identity changed but the current product link still holds (the product follows the offer). */
  linksKept: number;
  /** Matcher-created products updated to follow their offer (MPN, brand, attributes). */
  productsSynced: number;
  /** Stored MPN fields recognized as URL slug tails and re-read as hints. */
  urlDerivedMpnFields: number;
  /** Updated by the recorder between read and write: skipped. */
  raced: number;
  before: Distribution;
  after: Distribution;
}

export interface RenormalizeOptions {
  shopSlug?: string;
  dryRun?: boolean;
  batchSize?: number;
  /** Stop after this many offers (testing, sampling). */
  limit?: number;
  /** Called for every changed offer (CLI samples). */
  onChange?: (change: OfferChange) => void;
}

type StoredOffer = {
  id: string;
  shop_slug: string;
  shipping_rules: { free_over?: number | null; flat?: number | null; locker_flat?: number | null } | null;
  vat_included_default: boolean;
  external_id: string;
  url: string;
  title_raw: string;
  title_clean: string | null;
  title_ascii: string | null;
  brand_raw: string | null;
  brand_name: string | null;
  mpn_raw: string | null;
  mpn_norm: string | null;
  mpn_source: string | null;
  gtin_raw: string | null;
  gtin14: string | null;
  category_raw: string | null;
  category_slug: string | null;
  attributes: Record<string, unknown> | null;
  price: string;
  availability: string;
  condition: string;
  seller_name: string | null;
  seller_type: string;
  is_bundle: boolean;
  is_accessory: boolean;
  identity_hash: string | null;
  match_status: string;
  product_id: string | null;
  blacklisted: boolean;
  has_alias: boolean;
  last_checked_at: string;
  updated_at: string;
};

type StoredProduct = {
  id: string;
  created_by: string;
  title: string;
  mpn: string | null;
  mpn_norm: string | null;
  mpn_source: string | null;
  brand: string | null;
  category: string | null;
  attributes: Record<string, unknown> | null;
  gtin14: string | null;
  linked: string;
  edited: boolean;
};

interface ProductUpdate {
  id: number;
  mpn: string | null;
  mpnNorm: string | null;
  mpnSource: 'field' | 'title' | null;
  /** Also follow brand and attributes (single-offer projection). */
  projection: { brand: string | null; attributes: Record<string, unknown> } | null;
}

const HUMAN_STATUSES = new Set(['manual', 'rejected']);

function emptyDistribution(): Distribution {
  return { mpnField: 0, mpnTitle: 0, mpnNone: 0, noBrand: 0, bundles: 0, accessories: 0 };
}

function count(
  d: Distribution,
  v: { mpnSource: string | null; mpnNorm: string | null; brand: string | null; bundle: boolean; accessory: boolean },
): void {
  if (v.mpnNorm === null) d.mpnNone++;
  else if (v.mpnSource === 'field') d.mpnField++;
  else d.mpnTitle++;
  if (v.brand === null) d.noBrand++;
  if (v.bundle) d.bundles++;
  if (v.accessory) d.accessories++;
}

/** JSON with sorted keys, so attribute objects compare by content. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The RawOffer the recorder would have built, from the stored raw columns. */
function rawFromStored(s: StoredOffer): { raw: RawOffer; urlDerivedMpn: boolean } {
  const urlDerivedMpn = isUrlDerivedMpn(s.shop_slug, s.url, s.title_raw, s.mpn_raw);
  const raw: RawOffer = {
    shopSlug: s.shop_slug,
    externalId: s.external_id,
    url: s.url,
    title: s.title_raw,
    // Stored prices are RON incl. VAT: no conversion, no gross-up.
    price: s.price,
    priceFormat: 'decimal',
    currency: 'RON',
    vatIncluded: true,
    availability: s.availability,
    condition: s.condition,
    observedAt: new Date(s.last_checked_at).toISOString(),
    raw: {},
  };
  if (s.gtin_raw) raw.gtin = s.gtin_raw;
  if (s.mpn_raw && !urlDerivedMpn) raw.mpn = s.mpn_raw;
  const hint = urlMpnHint(s.shop_slug, s.url, s.title_raw);
  if (hint) raw.mpnHint = hint;
  if (s.brand_raw) raw.brand = s.brand_raw;
  if (s.category_raw) raw.category = s.category_raw;
  if (s.seller_name) raw.sellerName = s.seller_name;
  raw.isMarketplaceSeller = s.seller_type === 'marketplace';
  return { raw, urlDerivedMpn };
}

async function readBatch(db: Db, afterId: number, size: number, shopSlug: string | undefined): Promise<StoredOffer[]> {
  const res = await db.execute<StoredOffer>(sql`
    SELECT o.id::text, s.slug AS shop_slug, s.shipping_rules, s.vat_included_default,
           o.external_id, o.url, o.title_raw, o.title_clean, o.title_ascii, o.brand_raw, o.brand_name,
           o.mpn_raw, o.mpn_norm, o.mpn_source, o.gtin_raw, o.gtin14, o.category_raw, o.category_slug, o.attributes,
           o.price::text AS price, o.availability, o.condition, o.seller_name, o.seller_type,
           o.is_bundle, o.is_accessory, o.identity_hash, o.match_status, o.product_id::text AS product_id, o.blacklisted,
           EXISTS (SELECT 1 FROM offer_aliases a WHERE a.shop_id = o.shop_id AND a.external_id = o.external_id) AS has_alias,
           o.last_checked_at::text AS last_checked_at, o.updated_at::text AS updated_at
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE o.id > ${afterId} AND (${shopSlug ?? null}::text IS NULL OR s.slug = ${shopSlug ?? null})
    ORDER BY o.id
    LIMIT ${size}
  `);
  return res.rows;
}

async function readProduct(db: Db, id: number): Promise<StoredProduct | null> {
  const res = await db.execute<StoredProduct>(sql`
    SELECT p.id::text, p.created_by, p.title, p.mpn, p.mpn_norm, p.mpn_source, b.name AS brand, c.slug AS category, p.attributes,
      (SELECT min(g.gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtin14,
      (SELECT count(*) FROM offers o WHERE o.product_id = p.id)::text AS linked,
      EXISTS (SELECT 1 FROM audit_log a WHERE a.entity = 'products' AND a.entity_id = p.id::text) AS edited
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ${id} AND p.status = 'active'
  `);
  return res.rows[0] ?? null;
}

function productSide(p: StoredProduct, update: ProductUpdate | null): MatchSide {
  return {
    title: p.title,
    brand: update?.projection ? update.projection.brand : p.brand,
    mpnNorm: update ? update.mpnNorm : p.mpn_norm,
    gtin14: p.gtin14,
    category: p.category,
    attributes: update?.projection ? update.projection.attributes : (p.attributes ?? {}),
    mpnFromTitle: (update ? update.mpnSource : p.mpn_source) === 'title',
  };
}

async function applyProductUpdate(db: Db, u: ProductUpdate, brandChanged: boolean): Promise<void> {
  let brandId: number | null = null;
  if (u.projection?.brand) {
    // Same brand rows as the matcher creates (createProductFromOffer).
    const slug = slugPart(u.projection.brand);
    if (slug) {
      const r = await db.execute<{ id: string }>(sql`
        INSERT INTO brands (name, slug) VALUES (${u.projection.brand}, ${slug})
        ON CONFLICT (slug) DO UPDATE SET name = brands.name
        RETURNING id::text`);
      brandId = Number(r.rows[0]!.id);
    }
  }
  await db.execute(sql`
    UPDATE products SET mpn = ${u.mpn}, mpn_norm = ${u.mpnNorm}, mpn_source = ${u.mpnSource},
      brand_id = CASE WHEN ${u.projection !== null} THEN ${brandId} ELSE brand_id END,
      family_id = CASE WHEN ${u.projection !== null && brandChanged} THEN NULL ELSE family_id END,
      attributes = CASE WHEN ${u.projection !== null} THEN ${JSON.stringify(u.projection?.attributes ?? {})}::jsonb ELSE attributes END,
      updated_at = now()
    WHERE id = ${u.id}
  `);
}

/** Re-normalizes stored offers; see the module comment. Returns a before/after summary. */
export async function renormalizeOffers(db: Db, opts: RenormalizeOptions = {}): Promise<RenormalizeSummary> {
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const summary: RenormalizeSummary = {
    dryRun,
    scanned: 0,
    rejected: 0,
    changed: 0,
    columns: { title: 0, brand: 0, mpn: 0, mpnRaw: 0, mpnSource: 0, gtin: 0, attributes: 0, bundle: 0, accessory: 0 },
    identityChanged: 0,
    requeued: 0,
    locked: 0,
    linksKept: 0,
    productsSynced: 0,
    urlDerivedMpnFields: 0,
    raced: 0,
    before: emptyDistribution(),
    after: emptyDistribution(),
  };
  const productCache = new Map<number, StoredProduct | null>();
  const syncedProducts = new Set<number>();
  let afterId = 0;
  for (;;) {
    const size = opts.limit !== undefined ? Math.min(batchSize, opts.limit - summary.scanned) : batchSize;
    if (size <= 0) break;
    const rows = await readBatch(db, afterId, size, opts.shopSlug);
    if (rows.length === 0) break;
    afterId = Number(rows[rows.length - 1]!.id);
    for (const s of rows) {
      summary.scanned++;
      const stored = { mpnSource: s.mpn_source, mpnNorm: s.mpn_norm, brand: s.brand_name, bundle: s.is_bundle, accessory: s.is_accessory };
      count(summary.before, stored);
      const { raw, urlDerivedMpn } = rawFromStored(s);
      if (urlDerivedMpn) summary.urlDerivedMpnFields++;
      const n = normalizeOffer(raw, {
        shop: { slug: s.shop_slug, shippingRules: s.shipping_rules ?? {}, vatIncludedDefault: s.vat_included_default },
        observedAt: new Date(s.last_checked_at),
        eurRonRate: null,
        hash: contentHash,
      });
      if (!n.ok) {
        summary.rejected++;
        count(summary.after, stored);
        continue;
      }
      const id = offerIdentity(n);
      const next = {
        titleClean: n.titleClean,
        titleAscii: n.titleAscii,
        brandName: id.brandName,
        mpnRaw: n.mpnRaw,
        mpnNorm: n.mpnNorm,
        mpnSource: n.mpnSource,
        gtin14: id.gtin14,
        attributes: n.attributes as Record<string, unknown>,
        isBundle: n.isBundle,
        isAccessory: n.isAccessory,
        identityHash: id.identityHash,
      };
      count(summary.after, {
        mpnSource: next.mpnSource,
        mpnNorm: next.mpnNorm,
        brand: next.brandName,
        bundle: next.isBundle,
        accessory: next.isAccessory,
      });

      const changes: OfferChange['changes'] = {};
      if (s.title_clean !== next.titleClean || s.title_ascii !== next.titleAscii) changes.title = [s.title_clean, next.titleClean];
      if (s.brand_name !== next.brandName) changes.brand = [s.brand_name, next.brandName];
      if (s.mpn_norm !== next.mpnNorm) changes.mpn = [s.mpn_norm, next.mpnNorm];
      if (s.mpn_raw !== next.mpnRaw) changes.mpnRaw = [s.mpn_raw, next.mpnRaw];
      if (s.mpn_source !== next.mpnSource) changes.mpnSource = [s.mpn_source, next.mpnSource];
      if (s.gtin14 !== next.gtin14) changes.gtin = [s.gtin14, next.gtin14];
      if (stable(s.attributes ?? {}) !== stable(next.attributes)) changes.attributes = [s.attributes, next.attributes];
      if (s.is_bundle !== next.isBundle) changes.bundle = [s.is_bundle, next.isBundle];
      if (s.is_accessory !== next.isAccessory) changes.accessory = [s.is_accessory, next.isAccessory];
      const identityChanged = s.identity_hash !== next.identityHash;
      if (Object.keys(changes).length === 0 && !identityChanged) continue;

      const human = s.has_alias || s.blacklisted || HUMAN_STATUSES.has(s.match_status);
      // Products the matcher made from this offer follow it (see the module comment).
      let productUpdate: ProductUpdate | null = null;
      let keepLink = false;
      if (s.product_id !== null && s.match_status === 'auto' && !human) {
        const pid = Number(s.product_id);
        if (!productCache.has(pid)) productCache.set(pid, await readProduct(db, pid));
        const p = productCache.get(pid) ?? null;
        if (p && p.created_by === 'matcher' && !p.edited && !syncedProducts.has(pid)) {
          const newMpn = { mpn: next.mpnRaw ?? next.mpnNorm, mpnNorm: next.mpnNorm, mpnSource: next.mpnSource };
          if (Number(p.linked) === 1) {
            productUpdate = { id: pid, ...newMpn, projection: { brand: next.brandName, attributes: next.attributes } };
            keepLink = true;
          } else if (p.mpn_source === 'field' && isUrlDerivedMpn(s.shop_slug, s.url, s.title_raw, p.mpn)) {
            productUpdate = { id: pid, ...newMpn, projection: null };
          }
        }
        if (!keepLink && p) {
          const offerSide: MatchSide = {
            title: next.titleClean,
            brand: next.brandName,
            mpnNorm: next.mpnNorm,
            gtin14: next.gtin14,
            category: s.category_slug,
            attributes: next.attributes,
            mpnFromTitle: next.mpnSource === 'title',
          };
          const sc = scorePair(offerSide, productSide(p, productUpdate));
          keepLink = sc.conflicts.length === 0 && sc.score >= ACCEPT_AT;
        }
      }
      const requeue = identityChanged && !human && !keepLink;
      if (!dryRun) {
        const res = await db.execute(sql`
          UPDATE offers SET
            title_clean = ${next.titleClean}, title_ascii = ${next.titleAscii},
            brand_name = ${next.brandName},
            mpn_raw = ${next.mpnRaw}, mpn_norm = ${next.mpnNorm}, mpn_source = ${next.mpnSource},
            gtin14 = ${next.gtin14},
            attributes = ${JSON.stringify(next.attributes)}::jsonb,
            is_bundle = ${next.isBundle}, is_accessory = ${next.isAccessory},
            identity_hash = ${next.identityHash},
            match_status = CASE WHEN ${requeue} THEN 'pending' ELSE match_status END,
            matched_at = CASE WHEN ${requeue} THEN NULL ELSE matched_at END,
            updated_at = now()
          WHERE id = ${Number(s.id)} AND updated_at = ${s.updated_at}::timestamptz
        `);
        if ((res.rowCount ?? 0) === 0) {
          summary.raced++;
          continue;
        }
        if (productUpdate) {
          const p = productCache.get(productUpdate.id);
          await applyProductUpdate(db, productUpdate, p ? p.brand !== productUpdate.projection?.brand : false);
        }
      }
      if (productUpdate) {
        syncedProducts.add(productUpdate.id);
        summary.productsSynced++;
        // Later offers of the same product are scored against its new values.
        const p = productCache.get(productUpdate.id);
        if (p) {
          p.mpn = productUpdate.mpn;
          p.mpn_norm = productUpdate.mpnNorm;
          p.mpn_source = productUpdate.mpnSource;
          if (productUpdate.projection) {
            p.brand = productUpdate.projection.brand;
            p.attributes = productUpdate.projection.attributes;
          }
        }
      }
      summary.changed++;
      for (const k of Object.keys(changes) as RenormalizedColumn[]) summary.columns[k]++;
      if (identityChanged) {
        summary.identityChanged++;
        if (requeue) summary.requeued++;
        else if (human) summary.locked++;
        else summary.linksKept++;
      }
      opts.onChange?.({
        id: Number(s.id),
        shopSlug: s.shop_slug,
        title: s.title_raw,
        changes,
        identityChanged,
        requeued: requeue,
        productSynced: productUpdate?.id ?? null,
      });
    }
    if (rows.length < size) break;
  }
  return summary;
}
