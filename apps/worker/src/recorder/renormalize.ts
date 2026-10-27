import { sql } from 'drizzle-orm';
import { normalizeOffer, type RawOffer } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import type { Db } from '@pretoscop/db';
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
 * Offers whose identity hash changes go back to `pending` (the matcher re-matches them) unless a
 * human decided their mapping (an `offer_aliases` row, `match_status` 'manual' or 'rejected', or a
 * blacklisted offer): those keep their mapping. Prices, price events and history are never read
 * for writing nor touched. An offer updated by the recorder since it was read is skipped
 * (`raced`); run again to pick it up.
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
  shipping_rules: {
    free_over?: number | null;
    flat?: number | null;
    locker_flat?: number | null;
  } | null;
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
  blacklisted: boolean;
  has_alias: boolean;
  last_checked_at: string;
  updated_at: string;
};

const HUMAN_STATUSES = new Set(['manual', 'rejected']);

function emptyDistribution(): Distribution {
  return { mpnField: 0, mpnTitle: 0, mpnNone: 0, noBrand: 0, bundles: 0, accessories: 0 };
}

function count(
  d: Distribution,
  v: {
    mpnSource: string | null;
    mpnNorm: string | null;
    brand: string | null;
    bundle: boolean;
    accessory: boolean;
  },
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

async function readBatch(
  db: Db,
  afterId: number,
  size: number,
  shopSlug: string | undefined,
): Promise<StoredOffer[]> {
  const res = await db.execute<StoredOffer>(sql`
    SELECT o.id::text, s.slug AS shop_slug, s.shipping_rules, s.vat_included_default,
           o.external_id, o.url, o.title_raw, o.title_clean, o.title_ascii, o.brand_raw, o.brand_name,
           o.mpn_raw, o.mpn_norm, o.mpn_source, o.gtin_raw, o.gtin14, o.category_raw, o.attributes,
           o.price::text AS price, o.availability, o.condition, o.seller_name, o.seller_type,
           o.is_bundle, o.is_accessory, o.identity_hash, o.match_status, o.blacklisted,
           EXISTS (SELECT 1 FROM offer_aliases a WHERE a.shop_id = o.shop_id AND a.external_id = o.external_id) AS has_alias,
           o.last_checked_at::text AS last_checked_at, o.updated_at::text AS updated_at
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE o.id > ${afterId} AND (${shopSlug ?? null}::text IS NULL OR s.slug = ${shopSlug ?? null})
    ORDER BY o.id
    LIMIT ${size}
  `);
  return res.rows;
}

/** Re-normalizes stored offers; see the module comment. Returns a before/after summary. */
export async function renormalizeOffers(
  db: Db,
  opts: RenormalizeOptions = {},
): Promise<RenormalizeSummary> {
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const summary: RenormalizeSummary = {
    dryRun,
    scanned: 0,
    rejected: 0,
    changed: 0,
    columns: {
      title: 0,
      brand: 0,
      mpn: 0,
      mpnRaw: 0,
      mpnSource: 0,
      gtin: 0,
      attributes: 0,
      bundle: 0,
      accessory: 0,
    },
    identityChanged: 0,
    requeued: 0,
    locked: 0,
    urlDerivedMpnFields: 0,
    raced: 0,
    before: emptyDistribution(),
    after: emptyDistribution(),
  };
  let afterId = 0;
  for (;;) {
    const size =
      opts.limit !== undefined ? Math.min(batchSize, opts.limit - summary.scanned) : batchSize;
    if (size <= 0) break;
    const rows = await readBatch(db, afterId, size, opts.shopSlug);
    if (rows.length === 0) break;
    afterId = Number(rows[rows.length - 1]!.id);
    for (const s of rows) {
      summary.scanned++;
      count(summary.before, {
        mpnSource: s.mpn_source,
        mpnNorm: s.mpn_norm,
        brand: s.brand_name,
        bundle: s.is_bundle,
        accessory: s.is_accessory,
      });
      const { raw, urlDerivedMpn } = rawFromStored(s);
      if (urlDerivedMpn) summary.urlDerivedMpnFields++;
      const n = normalizeOffer(raw, {
        shop: {
          slug: s.shop_slug,
          shippingRules: s.shipping_rules ?? {},
          vatIncludedDefault: s.vat_included_default,
        },
        observedAt: new Date(s.last_checked_at),
        eurRonRate: null,
        hash: contentHash,
      });
      if (!n.ok) {
        summary.rejected++;
        count(summary.after, {
          mpnSource: s.mpn_source,
          mpnNorm: s.mpn_norm,
          brand: s.brand_name,
          bundle: s.is_bundle,
          accessory: s.is_accessory,
        });
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
      if (s.title_clean !== next.titleClean || s.title_ascii !== next.titleAscii)
        changes.title = [s.title_clean, next.titleClean];
      if (s.brand_name !== next.brandName) changes.brand = [s.brand_name, next.brandName];
      if (s.mpn_norm !== next.mpnNorm) changes.mpn = [s.mpn_norm, next.mpnNorm];
      if (s.mpn_raw !== next.mpnRaw) changes.mpnRaw = [s.mpn_raw, next.mpnRaw];
      if (s.mpn_source !== next.mpnSource) changes.mpnSource = [s.mpn_source, next.mpnSource];
      if (s.gtin14 !== next.gtin14) changes.gtin = [s.gtin14, next.gtin14];
      if (stable(s.attributes ?? {}) !== stable(next.attributes))
        changes.attributes = [s.attributes, next.attributes];
      if (s.is_bundle !== next.isBundle) changes.bundle = [s.is_bundle, next.isBundle];
      if (s.is_accessory !== next.isAccessory)
        changes.accessory = [s.is_accessory, next.isAccessory];
      const identityChanged = s.identity_hash !== next.identityHash;
      if (Object.keys(changes).length === 0 && !identityChanged) continue;

      const human = s.has_alias || s.blacklisted || HUMAN_STATUSES.has(s.match_status);
      const requeue = identityChanged && !human;
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
      }
      summary.changed++;
      for (const k of Object.keys(changes) as RenormalizedColumn[]) summary.columns[k]++;
      if (identityChanged) {
        summary.identityChanged++;
        if (requeue) summary.requeued++;
        else summary.locked++;
      }
      opts.onChange?.({
        id: Number(s.id),
        shopSlug: s.shop_slug,
        title: s.title_raw,
        changes,
        identityChanged,
        requeued: requeue,
      });
    }
    if (rows.length < size) break;
  }
  return summary;
}
