import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, numeric, pgTable, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { categories } from './catalog';
import { merchants } from './merchants';

/**
 * Promoted placements and merchant billing (M25, ADR-024). Money is `numeric(12,2)` RON here and
 * integer bani in code (`baniToNumeric`/`numericToBani` at the boundary). Accounting rows (ledger,
 * top-ups, promoted clicks) carry `merchant_id` without a foreign key: they must outlive a deleted
 * merchant profile (bookkeeping retention); the wallet itself refuses the profile's deletion while
 * it exists (ON DELETE RESTRICT), so no balance disappears silently.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export type PlacementStatus = 'active' | 'paused' | 'archived';
export type LedgerKind = 'topup' | 'click' | 'click_refund' | 'adjustment';
export type TopUpStatus = 'created' | 'pending' | 'paid' | 'expired' | 'failed';
export type PromotedClickStatus = 'billed' | 'refunded' | 'not_billed';
export type PromotedSlot = 'product' | 'category';

const BANDS = sql.raw(`('0-200','200-1000','1000-3000','3000+')`);

/**
 * A merchant's campaign: a cost-per-click bid for its offers in one category (and its
 * subcategories) and one price band (null: every band), with a daily spending cap. Paused or
 * archived by the merchant; `admin_hold` is the admin's pause, which only an admin lifts.
 */
export const placements = pgTable(
  'placements',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    merchantId: bigint('merchant_id', { mode: 'number' })
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    categoryId: bigint('category_id', { mode: 'number' })
      .notNull()
      .references(() => categories.id),
    priceBand: text('price_band'),
    bid: money('bid').notNull(),
    dailyCap: money('daily_cap').notNull(),
    status: text('status').$type<PlacementStatus>().notNull().default('active'),
    adminHold: boolean('admin_hold').notNull().default(false),
    adminHoldReason: text('admin_hold_reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('placements_category_idx').on(t.categoryId).where(sql`${t.status} = 'active' AND NOT ${t.adminHold}`),
    index('placements_merchant_idx').on(t.merchantId, t.status),
    // One live campaign per merchant, category and band: a merchant changes its bid, it does not stack campaigns.
    uniqueIndex('placements_live_uq').on(t.merchantId, t.categoryId, sql`coalesce(${t.priceBand}, '*')`).where(sql`${t.status} <> 'archived'`),
    check('placements_status_ck', sql`${t.status} in ('active','paused','archived')`),
    check('placements_band_ck', sql`${t.priceBand} is null or ${t.priceBand} in ${BANDS}`),
    check('placements_bid_ck', sql`${t.bid} > 0 and ${t.dailyCap} >= ${t.bid}`),
  ],
);

/** Floors and caps per category (null: site-wide) and price band, set by an admin. */
export const placementFloors = pgTable(
  'placement_floors',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id, { onDelete: 'cascade' }),
    priceBand: text('price_band').notNull(),
    floor: money('floor').notNull(),
    cap: money('cap').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('placement_floors_uq').on(sql`coalesce(${t.categoryId}, 0)`, t.priceBand),
    check('placement_floors_band_ck', sql`${t.priceBand} in ${BANDS}`),
    check('placement_floors_amount_ck', sql`${t.floor} > 0 and ${t.cap} >= ${t.floor}`),
  ],
);

/**
 * One prepaid wallet per merchant, created when the merchant accepts the promoted-placement terms
 * (`terms_version`). The balance never goes below zero (CHECK, and every movement locks the row).
 */
export const merchantWallets = pgTable(
  'merchant_wallets',
  {
    merchantId: bigint('merchant_id', { mode: 'number' })
      .primaryKey()
      .references(() => merchants.id, { onDelete: 'restrict' }),
    balance: money('balance').notNull().default('0'),
    termsVersion: text('terms_version').notNull(),
    termsAcceptedAt: ts('terms_accepted_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('merchant_wallets_balance_ck', sql`${t.balance} >= 0`)],
);

/**
 * Every movement of a wallet, append-only: credits (top-ups, click refunds, admin credits) are
 * positive, debits (billed clicks, admin debits) negative; `balance_after` is the balance once
 * applied. `ref` makes each movement idempotent (`stripe:<checkout session>`, `click:<id>`,
 * `refund:click:<id>`, `adjust:<uuid>`): a retried webhook or job can never apply it twice.
 */
export const walletLedger = pgTable(
  'wallet_ledger',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    merchantId: bigint('merchant_id', { mode: 'number' }).notNull(),
    kind: text('kind').$type<LedgerKind>().notNull(),
    amount: money('amount').notNull(),
    balanceAfter: money('balance_after').notNull(),
    ref: text('ref').notNull(),
    promotedClickId: bigint('promoted_click_id', { mode: 'number' }),
    topupId: bigint('topup_id', { mode: 'number' }),
    actor: text('actor').notNull(),
    note: text('note'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallet_ledger_ref_uq').on(t.ref),
    index('wallet_ledger_merchant_idx').on(t.merchantId, t.createdAt),
    check('wallet_ledger_kind_ck', sql`${t.kind} in ('topup','click','click_refund','adjustment')`),
    check(
      'wallet_ledger_sign_ck',
      sql`${t.amount} <> 0 and ${t.balanceAfter} >= 0 and (${t.kind} = 'adjustment' or (${t.kind} in ('topup','click_refund') and ${t.amount} > 0) or (${t.kind} = 'click' and ${t.amount} < 0))`,
    ),
  ],
);

/**
 * Top-ups through the payment provider (Stripe Checkout). The wallet is credited with `net` once,
 * by the provider's signed webhook, only when the paid amount and currency match `gross`/`currency`.
 * `vat` is on top while the company is a VAT payer (`TOPUP_VAT_PERCENT`); 0 before.
 */
export const walletTopups = pgTable(
  'wallet_topups',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    merchantId: bigint('merchant_id', { mode: 'number' }).notNull(),
    provider: text('provider').notNull(),
    /** The provider's object (Stripe Checkout Session id); null until the checkout is opened. */
    externalId: text('external_id'),
    status: text('status').$type<TopUpStatus>().notNull().default('created'),
    net: money('net').notNull(),
    vat: money('vat').notNull(),
    gross: money('gross').notNull(),
    vatPercent: smallint('vat_percent').notNull(),
    currency: text('currency').notNull().default('RON'),
    /** The provider event that credited (or closed) the top-up. */
    eventId: text('event_id'),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    paidAt: ts('paid_at'),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('wallet_topups_external_uq').on(t.provider, t.externalId),
    index('wallet_topups_merchant_idx').on(t.merchantId, t.createdAt),
    check('wallet_topups_status_ck', sql`${t.status} in ('created','pending','paid','expired','failed')`),
    check('wallet_topups_amount_ck', sql`${t.net} > 0 and ${t.vat} >= 0 and ${t.gross} = ${t.net} + ${t.vat}`),
  ],
);

/**
 * Every click from a promoted slot (`/out/{offer}?p=promoted_*&k={placement}`), billed or not, with
 * the reason when not. At most one billed click per hashed session, offer and day (the unique index
 * is the last guard; billing also locks the wallet). The hashes use the daily rotating salt, so
 * `day` is the UTC day of that salt; they are cleared after 30 days (`promoted.daily`).
 */
export const promotedClicks = pgTable(
  'promoted_clicks',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** The `clicks` row of the same click-out (no foreign key: clicks are aggregated after 90 days). */
    clickId: bigint('click_id', { mode: 'number' }),
    placementId: bigint('placement_id', { mode: 'number' }).notNull(),
    merchantId: bigint('merchant_id', { mode: 'number' }).notNull(),
    offerId: bigint('offer_id', { mode: 'number' }).notNull(),
    productId: bigint('product_id', { mode: 'number' }),
    /** The category page of a category-slot click. */
    categoryId: bigint('category_id', { mode: 'number' }),
    slot: text('slot').$type<PromotedSlot>().notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    sessionHash: text('session_hash'),
    ipHash: text('ip_hash'),
    status: text('status').$type<PromotedClickStatus>().notNull(),
    reason: text('reason'),
    price: money('price').notNull().default('0'),
    refundedAt: ts('refunded_at'),
    refundReason: text('refund_reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promoted_clicks_once_uq').on(t.offerId, t.sessionHash, t.day).where(sql`${t.status} <> 'not_billed'`),
    index('promoted_clicks_placement_idx').on(t.placementId, t.createdAt),
    index('promoted_clicks_merchant_idx').on(t.merchantId, t.createdAt),
    index('promoted_clicks_session_idx').on(t.sessionHash, t.createdAt),
    index('promoted_clicks_ip_idx').on(t.ipHash, t.createdAt),
    check('promoted_clicks_slot_ck', sql`${t.slot} in ('product','category')`),
    check(
      'promoted_clicks_status_ck',
      sql`(${t.status} = 'billed' and ${t.price} > 0 and ${t.reason} is null) or (${t.status} = 'refunded' and ${t.price} > 0) or (${t.status} = 'not_billed' and ${t.price} = 0 and ${t.reason} is not null)`,
    ),
  ],
);
