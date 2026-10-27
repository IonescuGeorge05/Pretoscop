import { sql } from 'drizzle-orm';
import { bigint, char, check, date, index, numeric, pgTable, primaryKey, real, text, timestamp } from 'drizzle-orm/pg-core';
import { offers } from './offers';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

/**
 * Observations held back by the anomaly guard (M08): a price more than 3× or less than 0.33× the
 * offer's 14-day median is not published until a second observation agrees (or an admin releases it).
 */
export const priceEventsQuarantine = pgTable(
  'price_events_quarantine',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    offerId: bigint('offer_id', { mode: 'number' })
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    observedAt: ts('observed_at').notNull(),
    price: money('price').notNull(),
    medianPrice: money('median_price'),
    ratio: real('ratio'),
    reason: text('reason').notNull(),
    /** The full observation, so a release can apply it exactly as seen. */
    observation: text('observation').notNull(),
    runId: bigint('run_id', { mode: 'number' }),
    status: text('status').notNull().default('pending'),
    resolvedAt: ts('resolved_at'),
    resolvedBy: text('resolved_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('price_events_quarantine_offer_idx').on(t.offerId, t.status),
    check('price_events_quarantine_status_ck', sql`${t.status} in ('pending','confirmed','rejected','released')`),
  ],
);

/** BNR daily reference rates (curs.bnr.ro), recorded with every converted event. */
export const fxRates = pgTable(
  'fx_rates',
  {
    day: date('day', { mode: 'string' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    rate: numeric('rate', { precision: 10, scale: 4 }).notNull(),
    source: text('source').notNull().default('bnr'),
  },
  (t) => [primaryKey({ columns: [t.day, t.currency] })],
);
