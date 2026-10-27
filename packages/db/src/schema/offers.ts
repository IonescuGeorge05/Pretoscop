import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { products } from './catalog';
import { ingestRuns, shopSources, shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export type Availability = 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
export type Condition = 'new' | 'refurbished' | 'used';
export type SellerType = 'shop' | 'marketplace';
export type MatchStatus = 'auto' | 'manual' | 'pending' | 'unmatched' | 'rejected';

/**
 * One offer of one shop (UNIQUE shop_id + external_id). Money is numeric(12,2) RON incl. VAT,
 * returned by the driver as strings. `last_checked_at` advances on every confirmation, even when
 * nothing changed; `price_changed_at` only when the content hash changed.
 */
export const offers = pgTable(
  'offers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id),
    sourceId: bigint('source_id', { mode: 'number' }).references(() => shopSources.id, {
      onDelete: 'set null',
    }),
    /** 1 crawl or merchant feed, 2 affiliate feed, 3 user report, 4 link-only. */
    sourceTier: smallint('source_tier').notNull().default(1),
    externalId: text('external_id').notNull(),
    productId: bigint('product_id', { mode: 'number' }).references(() => products.id),
    url: text('url').notNull(),
    affiliateUrl: text('affiliate_url'),
    titleRaw: text('title_raw').notNull(),
    titleClean: text('title_clean'),
    titleAscii: text('title_ascii'),
    brandRaw: text('brand_raw'),
    brandName: text('brand_name'),
    mpnRaw: text('mpn_raw'),
    mpnNorm: text('mpn_norm'),
    /** 'field' (structured data, feed, URL slug) or 'title' (guessed from the title: may be a series code). */
    mpnSource: text('mpn_source'),
    gtinRaw: text('gtin_raw'),
    gtin14: text('gtin14'),
    categoryRaw: text('category_raw'),
    /** Launch-taxonomy leaf (core `categorize`), set by matching. */
    categorySlug: text('category_slug'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    price: money('price').notNull(),
    oldPrice: money('old_price'),
    shopLowest30d: money('shop_lowest_30d'),
    currency: char('currency', { length: 3 }).notNull().default('RON'),
    fxRate: numeric('fx_rate', { precision: 10, scale: 4 }),
    shippingCost: money('shipping_cost'),
    shippingNote: text('shipping_note'),
    shippingEstimated: boolean('shipping_estimated').notNull().default(true),
    totalPrice: money('total_price').notNull(),
    availability: text('availability').$type<Availability>().notNull().default('unknown'),
    condition: text('condition').$type<Condition>().notNull().default('new'),
    conditionDetail: text('condition_detail'),
    sellerName: text('seller_name'),
    sellerType: text('seller_type').$type<SellerType>().notNull().default('shop'),
    isBundle: boolean('is_bundle').notNull().default(false),
    isAccessory: boolean('is_accessory').notNull().default(false),
    matchStatus: text('match_status').$type<MatchStatus>().notNull().default('pending'),
    matchScore: real('match_score'),
    matchReason: text('match_reason'),
    /** sha256 over (title_norm, gtin14, mpn_norm, brand); re-matching only when it changes. */
    identityHash: text('identity_hash'),
    matchedAt: ts('matched_at'),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    lastCheckedAt: ts('last_checked_at').notNull(),
    priceChangedAt: ts('price_changed_at').notNull(),
    /** sha256 of normalized (price, old_price, shipping_cost, availability). */
    contentHash: text('content_hash').notNull(),
    active: boolean('active').notNull().default(true),
    /** Consecutive successful full runs of the source that did not contain this offer. */
    missingRuns: smallint('missing_runs').notNull().default(0),
    blacklisted: boolean('blacklisted').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('offers_shop_external_uq').on(t.shopId, t.externalId),
    index('offers_product_idx').on(t.productId),
    index('offers_source_idx').on(t.sourceId),
    index('offers_gtin14_idx').on(t.gtin14),
    index('offers_mpn_norm_idx').on(t.mpnNorm),
    index('offers_match_status_idx').on(t.matchStatus),
    index('offers_category_slug_idx').on(t.categorySlug),
    index('offers_last_checked_idx').on(t.lastCheckedAt),
    check('offers_source_tier_ck', sql`${t.sourceTier} between 1 and 4`),
    check(
      'offers_availability_ck',
      sql`${t.availability} in ('in_stock','out_of_stock','preorder','unknown')`,
    ),
    check('offers_condition_ck', sql`${t.condition} in ('new','refurbished','used')`),
    check('offers_seller_type_ck', sql`${t.sellerType} in ('shop','marketplace')`),
    check(
      'offers_match_status_ck',
      sql`${t.matchStatus} in ('auto','manual','pending','unmatched','rejected')`,
    ),
    check('offers_price_positive_ck', sql`${t.price} > 0`),
  ],
);

/**
 * Change-only price history, PARTITIONED BY RANGE (observed_at) monthly (see the custom
 * migration). A row exists only on first sight, on a change of the content hash, or on
 * reactivation. Uniqueness on (offer_id, observed_at) makes retried runs idempotent.
 */
export const priceEvents = pgTable(
  'price_events',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    offerId: bigint('offer_id', { mode: 'number' })
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    observedAt: ts('observed_at').notNull(),
    price: money('price').notNull(),
    oldPrice: money('old_price'),
    shippingCost: money('shipping_cost'),
    availability: text('availability').$type<Availability>().notNull(),
    currency: char('currency', { length: 3 }).notNull().default('RON'),
    fxRate: numeric('fx_rate', { precision: 10, scale: 4 }),
    /** 'first' | 'change' | 'reactivated' */
    kind: text('kind').notNull().default('change'),
    runId: bigint('run_id', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.offerId, t.observedAt] }),
    index('price_events_observed_brin').using('brin', t.observedAt),
  ],
);

/**
 * Coverage gaps: two consecutive checks of an offer more than the gap threshold apart (48 h).
 * Charts and rollups never extend a price step across a gap (no fabricated history).
 */
export const offerGaps = pgTable(
  'offer_gaps',
  {
    offerId: bigint('offer_id', { mode: 'number' })
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    fromTs: ts('from_ts').notNull(),
    toTs: ts('to_ts').notNull(),
  },
  (t) => [primaryKey({ columns: [t.offerId, t.fromTs] })],
);

/** Daily rollup per product (M08): drives charts and "price from". */
export const productDaily = pgTable(
  'product_daily',
  {
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    minPrice: money('min_price'),
    minTotalPrice: money('min_total_price'),
    minOfferId: bigint('min_offer_id', { mode: 'number' }),
    minShopId: bigint('min_shop_id', { mode: 'number' }),
    medianPrice: money('median_price'),
    offerCount: integer('offer_count').notNull().default(0),
    inStockCount: integer('in_stock_count').notNull().default(0),
    /** Marketplace sellers are a separate series, excluded from the default minimum. */
    mpMinTotalPrice: money('mp_min_total_price'),
    mpMinOfferId: bigint('mp_min_offer_id', { mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.day] })],
);

export type Verdict = 'good_price' | 'usual' | 'above_usual' | 'insufficient_data';

export const productStats = pgTable(
  'product_stats',
  {
    productId: bigint('product_id', { mode: 'number' })
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    currentMinTotal: money('current_min_total'),
    currentMinOfferId: bigint('current_min_offer_id', { mode: 'number' }),
    min30d: money('min_30d'),
    min30dAt: date('min_30d_at', { mode: 'string' }),
    minAllTime: money('min_all_time'),
    minAllTimeAt: date('min_all_time_at', { mode: 'string' }),
    median90d: money('median_90d'),
    lastChangeAt: ts('last_change_at'),
    dropPct7d: real('drop_pct_7d'),
    verdict: text('verdict').$type<Verdict>().notNull().default('insufficient_data'),
    observationsDays: integer('observations_days').notNull().default(0),
    historyStartedAt: date('history_started_at', { mode: 'string' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'product_stats_verdict_ck',
      sql`${t.verdict} in ('good_price','usual','above_usual','insufficient_data')`,
    ),
  ],
);

export { ingestRuns };
