import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { baniToNumeric, nullableBaniToNumeric } from '../money';
import type { Availability, Condition, SellerType } from '../schema/offers';

/** Two consecutive checks further apart than this create an `offer_gaps` row. */
export const DEFAULT_GAP_THRESHOLD_HOURS = 48;

/**
 * One observation of one offer, already normalized (M06). Money in integer bani, RON incl. VAT.
 * `contentHash` = sha256 of normalized (price, old_price, shipping_cost, availability) from
 * `@pretoscop/core/hash`.
 */
export interface OfferObservation {
  shopId: number;
  sourceId: number | null;
  sourceTier: 1 | 2 | 3 | 4;
  runId: number | null;
  externalId: string;
  url: string;
  affiliateUrl?: string | null;
  titleRaw: string;
  titleClean?: string | null;
  titleAscii?: string | null;
  brandRaw?: string | null;
  brandName?: string | null;
  mpnRaw?: string | null;
  mpnNorm?: string | null;
  gtinRaw?: string | null;
  gtin14?: string | null;
  categoryRaw?: string | null;
  attributes?: Record<string, unknown>;
  priceBani: number;
  oldPriceBani?: number | null;
  shopLowest30dBani?: number | null;
  currency?: string;
  fxRate?: string | null;
  shippingBani?: number | null;
  shippingNote?: string | null;
  shippingEstimated?: boolean;
  totalBani: number;
  availability: Availability;
  condition: Condition;
  conditionDetail?: string | null;
  sellerName?: string | null;
  sellerType?: SellerType;
  isBundle?: boolean;
  isAccessory?: boolean;
  identityHash?: string | null;
  contentHash: string;
  observedAt: Date;
}

export type EventKind = 'first' | 'change' | 'reactivated';

export interface RecordResult {
  offerId: number | null;
  /** The offer did not exist before. */
  inserted: boolean;
  /** The content hash differs from the stored one. */
  changed: boolean;
  /** A price_events row was written (first sight, change or reactivation). */
  eventKind: EventKind | null;
  /** The observation is older than the stored one (replays): nothing was written. */
  stale: boolean;
  /** A coverage gap was recorded before this observation. */
  gap: boolean;
  /** The identity hash changed: the offer must be (re)matched. */
  needsMatch: boolean;
}

type UpsertRow = {
  id: string;
  inserted: boolean;
  old_hash: string | null;
  new_hash: string;
  old_active: boolean | null;
  /** epoch ms; raw `execute` returns timestamptz as text, so SQL converts it. */
  old_checked_ms: string | null;
  old_identity: string | null;
  new_identity: string | null;
  product_id: string | null;
};

/**
 * Upserts the offer and writes a price event only on first sight, content change or reactivation,
 * in one transaction. Uses PostgreSQL 18 `INSERT … ON CONFLICT DO UPDATE … RETURNING old.*, new.*`
 * to learn the previous state in the same statement. Idempotent for a retried run: the same
 * observation (same offer, same observed_at) never creates a second event.
 */
export async function recordObservation(
  db: Db,
  o: OfferObservation,
  opts: { gapThresholdHours?: number } = {},
): Promise<RecordResult> {
  const gapMs = (opts.gapThresholdHours ?? DEFAULT_GAP_THRESHOLD_HOURS) * 3600_000;
  const price = baniToNumeric(o.priceBani);
  const oldPrice = nullableBaniToNumeric(o.oldPriceBani);
  const shipping = nullableBaniToNumeric(o.shippingBani);
  const total = baniToNumeric(o.totalBani);
  const lowest = nullableBaniToNumeric(o.shopLowest30dBani);
  const attrs = JSON.stringify(o.attributes ?? {});

  return db.transaction(async (tx) => {
    const res = await tx.execute<UpsertRow>(sql`
      INSERT INTO offers (
        shop_id, source_id, source_tier, external_id, url, affiliate_url,
        title_raw, title_clean, title_ascii, brand_raw, brand_name, mpn_raw, mpn_norm,
        gtin_raw, gtin14, category_raw, attributes,
        price, old_price, shop_lowest_30d, currency, fx_rate,
        shipping_cost, shipping_note, shipping_estimated, total_price,
        availability, condition, condition_detail, seller_name, seller_type,
        is_bundle, is_accessory, identity_hash,
        first_seen_at, last_seen_at, last_checked_at, price_changed_at, content_hash,
        active, missing_runs
      ) VALUES (
        ${o.shopId}, ${o.sourceId}, ${o.sourceTier}, ${o.externalId}, ${o.url}, ${o.affiliateUrl ?? null},
        ${o.titleRaw}, ${o.titleClean ?? null}, ${o.titleAscii ?? null}, ${o.brandRaw ?? null},
        ${o.brandName ?? null}, ${o.mpnRaw ?? null}, ${o.mpnNorm ?? null},
        ${o.gtinRaw ?? null}, ${o.gtin14 ?? null}, ${o.categoryRaw ?? null}, ${attrs}::jsonb,
        ${price}, ${oldPrice}, ${lowest}, ${o.currency ?? 'RON'}, ${o.fxRate ?? null},
        ${shipping}, ${o.shippingNote ?? null}, ${o.shippingEstimated ?? true}, ${total},
        ${o.availability}, ${o.condition}, ${o.conditionDetail ?? null}, ${o.sellerName ?? null},
        ${o.sellerType ?? 'shop'}, ${o.isBundle ?? false}, ${o.isAccessory ?? false}, ${o.identityHash ?? null},
        ${o.observedAt}, ${o.observedAt}, ${o.observedAt}, ${o.observedAt}, ${o.contentHash},
        true, 0
      )
      ON CONFLICT (shop_id, external_id) DO UPDATE SET
        source_id = EXCLUDED.source_id,
        source_tier = EXCLUDED.source_tier,
        url = EXCLUDED.url,
        affiliate_url = COALESCE(EXCLUDED.affiliate_url, offers.affiliate_url),
        title_raw = EXCLUDED.title_raw,
        title_clean = COALESCE(EXCLUDED.title_clean, offers.title_clean),
        title_ascii = COALESCE(EXCLUDED.title_ascii, offers.title_ascii),
        brand_raw = COALESCE(EXCLUDED.brand_raw, offers.brand_raw),
        brand_name = COALESCE(EXCLUDED.brand_name, offers.brand_name),
        mpn_raw = COALESCE(EXCLUDED.mpn_raw, offers.mpn_raw),
        mpn_norm = COALESCE(EXCLUDED.mpn_norm, offers.mpn_norm),
        gtin_raw = COALESCE(EXCLUDED.gtin_raw, offers.gtin_raw),
        gtin14 = COALESCE(EXCLUDED.gtin14, offers.gtin14),
        category_raw = COALESCE(EXCLUDED.category_raw, offers.category_raw),
        attributes = offers.attributes || EXCLUDED.attributes,
        price = EXCLUDED.price,
        old_price = EXCLUDED.old_price,
        shop_lowest_30d = COALESCE(EXCLUDED.shop_lowest_30d, offers.shop_lowest_30d),
        currency = EXCLUDED.currency,
        fx_rate = EXCLUDED.fx_rate,
        shipping_cost = EXCLUDED.shipping_cost,
        shipping_note = COALESCE(EXCLUDED.shipping_note, offers.shipping_note),
        shipping_estimated = EXCLUDED.shipping_estimated,
        total_price = EXCLUDED.total_price,
        availability = EXCLUDED.availability,
        condition = EXCLUDED.condition,
        condition_detail = EXCLUDED.condition_detail,
        seller_name = COALESCE(EXCLUDED.seller_name, offers.seller_name),
        seller_type = EXCLUDED.seller_type,
        is_bundle = EXCLUDED.is_bundle,
        is_accessory = EXCLUDED.is_accessory,
        identity_hash = COALESCE(EXCLUDED.identity_hash, offers.identity_hash),
        match_status = CASE
          WHEN EXCLUDED.identity_hash IS NOT NULL
           AND offers.identity_hash IS DISTINCT FROM EXCLUDED.identity_hash THEN 'pending'
          ELSE offers.match_status END,
        last_seen_at = EXCLUDED.last_seen_at,
        last_checked_at = EXCLUDED.last_checked_at,
        price_changed_at = CASE
          WHEN offers.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN EXCLUDED.price_changed_at
          ELSE offers.price_changed_at END,
        content_hash = EXCLUDED.content_hash,
        active = true,
        missing_runs = 0,
        updated_at = now()
      WHERE offers.last_checked_at <= EXCLUDED.last_checked_at
      RETURNING
        new.id::text AS id,
        (old.id IS NULL) AS inserted,
        old.content_hash AS old_hash,
        new.content_hash AS new_hash,
        old.active AS old_active,
        (extract(epoch FROM old.last_checked_at) * 1000)::bigint::text AS old_checked_ms,
        old.identity_hash AS old_identity,
        new.identity_hash AS new_identity,
        new.product_id::text AS product_id
    `);
    const row = res.rows[0];
    if (!row) {
      return {
        offerId: null,
        inserted: false,
        changed: false,
        eventKind: null,
        stale: true,
        gap: false,
        needsMatch: false,
      };
    }
    const offerId = Number(row.id);
    const changed = !row.inserted && row.old_hash !== row.new_hash;
    const eventKind: EventKind | null = row.inserted
      ? 'first'
      : changed
        ? 'change'
        : row.old_active === false
          ? 'reactivated'
          : null;

    let gap = false;
    const oldChecked = row.old_checked_ms === null ? null : new Date(Number(row.old_checked_ms));
    if (!row.inserted && oldChecked && o.observedAt.getTime() - oldChecked.getTime() > gapMs) {
      gap = true;
      await tx.execute(sql`
        INSERT INTO offer_gaps (offer_id, from_ts, to_ts)
        VALUES (${offerId}, ${oldChecked}, ${o.observedAt})
        ON CONFLICT DO NOTHING
      `);
    }

    if (eventKind) {
      await tx.execute(sql`
        INSERT INTO price_events (offer_id, observed_at, price, old_price, shipping_cost, availability,
                                  currency, fx_rate, kind, run_id)
        VALUES (${offerId}, ${o.observedAt}, ${price}, ${oldPrice}, ${shipping}, ${o.availability},
                ${o.currency ?? 'RON'}, ${o.fxRate ?? null}, ${eventKind}, ${o.runId})
        ON CONFLICT (offer_id, observed_at) DO NOTHING
      `);
    }

    const needsMatch =
      row.inserted ||
      row.product_id === null ||
      (row.new_identity !== null && row.old_identity !== row.new_identity);

    return { offerId, inserted: row.inserted, changed, eventKind, stale: false, gap, needsMatch };
  });
}

/** Price fields of a re-check of a known offer (e.g. Tier A product-page verification). */
export interface PriceObservation {
  priceBani: number;
  oldPriceBani?: number | null;
  shippingBani?: number | null;
  totalBani: number;
  shopLowest30dBani?: number | null;
  availability: Availability;
  contentHash: string;
  currency?: string;
  fxRate?: string | null;
  observedAt: Date;
  runId?: number | null;
}

/**
 * Updates a known offer's price fields and writes a price event only when the content hash
 * changed (or the offer was inactive). PostgreSQL 18 `UPDATE … RETURNING old.*, new.*`.
 */
export async function insertPriceEventIfChanged(
  db: Db,
  offerId: number,
  p: PriceObservation,
): Promise<{ changed: boolean; stale: boolean }> {
  const price = baniToNumeric(p.priceBani);
  const oldPrice = nullableBaniToNumeric(p.oldPriceBani);
  const shipping = nullableBaniToNumeric(p.shippingBani);
  return db.transaction(async (tx) => {
    const res = await tx.execute<{ old_hash: string; new_hash: string; old_active: boolean }>(sql`
      UPDATE offers SET
        price = ${price},
        old_price = ${oldPrice},
        shipping_cost = ${shipping},
        total_price = ${baniToNumeric(p.totalBani)},
        shop_lowest_30d = COALESCE(${nullableBaniToNumeric(p.shopLowest30dBani)}, shop_lowest_30d),
        availability = ${p.availability},
        price_changed_at = CASE WHEN content_hash IS DISTINCT FROM ${p.contentHash}
                                THEN ${p.observedAt} ELSE price_changed_at END,
        content_hash = ${p.contentHash},
        last_seen_at = ${p.observedAt},
        last_checked_at = ${p.observedAt},
        active = true,
        missing_runs = 0,
        updated_at = now()
      WHERE id = ${offerId} AND last_checked_at <= ${p.observedAt}
      RETURNING old.content_hash AS old_hash, new.content_hash AS new_hash, old.active AS old_active
    `);
    const row = res.rows[0];
    if (!row) return { changed: false, stale: true };
    const changed = row.old_hash !== row.new_hash;
    const kind: EventKind | null = changed ? 'change' : row.old_active ? null : 'reactivated';
    if (kind) {
      await tx.execute(sql`
        INSERT INTO price_events (offer_id, observed_at, price, old_price, shipping_cost, availability,
                                  currency, fx_rate, kind, run_id)
        VALUES (${offerId}, ${p.observedAt}, ${price}, ${oldPrice}, ${shipping}, ${p.availability},
                ${p.currency ?? 'RON'}, ${p.fxRate ?? null}, ${kind}, ${p.runId ?? null})
        ON CONFLICT (offer_id, observed_at) DO NOTHING
      `);
    }
    return { changed, stale: false };
  });
}

/**
 * Deactivation rule (M05): after a successful, full-size run, offers of the source that were not
 * seen gain one missing run; at two consecutive missing runs they become inactive.
 * Returns the number of offers deactivated by this call.
 */
export async function markMissingOffers(
  db: Db,
  sourceId: number,
  runStartedAt: Date,
  missingRunsToDeactivate = 2,
): Promise<{ incremented: number; deactivated: number }> {
  const res = await db.execute<{ deactivated: boolean }>(sql`
    UPDATE offers SET
      missing_runs = missing_runs + 1,
      active = CASE WHEN missing_runs + 1 >= ${missingRunsToDeactivate} THEN false ELSE active END,
      updated_at = now()
    WHERE source_id = ${sourceId} AND active AND last_seen_at < ${runStartedAt}
    RETURNING (NOT new.active AND old.active) AS deactivated
  `);
  return {
    incremented: res.rows.length,
    deactivated: res.rows.filter((r) => r.deactivated).length,
  };
}
