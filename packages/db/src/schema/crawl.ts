import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgTable, real, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { shopSources, shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * URL frontier (M05): product URLs discovered from sitemaps and listings, with the bookkeeping that
 * decides which pages a product-page source fetches today (oldest first, or by popularity for
 * Tier A). Delisting evidence: `gone_at` after a 404/410.
 */
export const crawlUrls = pgTable(
  'crawl_urls',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    sourceId: bigint('source_id', { mode: 'number' }).references(() => shopSources.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    kind: text('kind').notNull().default('product'),
    /** Shop-side identity hint (eMAG PNK, product code) used to dedupe and to join offers. */
    externalHint: text('external_hint'),
    /** Popularity signal (eMAG review count, …); Tier A picks the highest. */
    priority: real('priority').notNull().default(0),
    tier: text('tier'),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    lastFetchedAt: ts('last_fetched_at'),
    lastStatus: smallint('last_status'),
    failCount: integer('fail_count').notNull().default(0),
    goneAt: ts('gone_at'),
  },
  (t) => [
    uniqueIndex('crawl_urls_shop_url_uq').on(t.shopId, t.url),
    index('crawl_urls_shop_fetched_idx').on(t.shopId, t.lastFetchedAt),
    index('crawl_urls_shop_priority_idx').on(t.shopId, t.priority),
    check('crawl_urls_kind_ck', sql`${t.kind} in ('product','listing')`),
  ],
);
