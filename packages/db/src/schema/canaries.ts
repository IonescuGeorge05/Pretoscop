import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { shopSources, shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export type CanaryStatus = 'ok' | 'drift' | 'fetch_failed' | 'skipped';

/** Per-field counts over the offers parsed from one canary URL. */
export interface CanaryFieldStats {
  /** Offers parsed from the page. */
  offers: number;
  /** field → offers where it is present. */
  present: Record<string, number>;
  /** field → offers where it is present but unusable (price that does not parse, GTIN with a bad check digit, …). */
  invalid: Record<string, number>;
}

/**
 * Extractor canary (M21, docs/03 §11): once a week, up to five live URLs per active shop are
 * fetched politely and parsed; field presence and validity are compared with the previous week.
 * One row per URL; a run is identified by `run_key`.
 */
export const extractorCanaries = pgTable(
  'extractor_canaries',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runKey: text('run_key').notNull(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    sourceId: bigint('source_id', { mode: 'number' }).references(() => shopSources.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    parserKey: text('parser_key').notNull(),
    /** `listing` or `product` (the fetch purpose). */
    purpose: text('purpose').notNull(),
    checkedAt: ts('checked_at').notNull().defaultNow(),
    status: text('status').$type<CanaryStatus>().notNull(),
    httpStatus: smallint('http_status'),
    offers: integer('offers').notNull().default(0),
    fields: jsonb('fields').$type<CanaryFieldStats>(),
    /** Human-readable drift findings for the shop+parser of this row (empty when nothing moved). */
    issues: jsonb('issues').$type<string[]>().notNull().default([]),
    detail: text('detail'),
  },
  (t) => [
    index('extractor_canaries_shop_checked_idx').on(t.shopId, t.checkedAt),
    index('extractor_canaries_run_idx').on(t.runKey),
    check('extractor_canaries_status_ck', sql`${t.status} in ('ok','drift','fetch_failed','skipped')`),
    check('extractor_canaries_purpose_ck', sql`${t.purpose} in ('listing','product')`),
  ],
);
