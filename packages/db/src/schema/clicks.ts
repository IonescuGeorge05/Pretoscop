import { bigint, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Click-outs through /out/{offerId} (M13). No raw IP or User-Agent: hashes with the daily rotating
 * salt (CLAUDE.md), so clicks cannot be linked across days. Aggregated after 90 days (M19 retention).
 */
export const clicks = pgTable(
  'clicks',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    offerId: bigint('offer_id', { mode: 'number' }).notNull(),
    productId: bigint('product_id', { mode: 'number' }),
    shopId: bigint('shop_id', { mode: 'number' }).notNull(),
    ts: timestamp('ts', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    isAffiliate: boolean('is_affiliate').notNull().default(false),
    placement: text('placement'),
    refererType: text('referer_type'),
    uaHash: text('ua_hash'),
    ipHash: text('ip_hash'),
    sessionHash: text('session_hash'),
  },
  (t) => [index('clicks_ts_brin').using('brin', t.ts), index('clicks_offer_idx').on(t.offerId), index('clicks_shop_ts_idx').on(t.shopId, t.ts)],
);
