import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Server-side product analytics (ADR-010): no cookies, no raw IPs. `session_hash` is a sha256 of
 * (daily rotating salt, IP, User-Agent), so sessions cannot be linked across days.
 */
export const events = pgTable(
  'events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ts: timestamp('ts', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    name: text('name').notNull(),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    sessionHash: text('session_hash'),
    path: text('path'),
    referrerHost: text('referrer_host'),
  },
  (t) => [index('events_ts_brin').using('brin', t.ts), index('events_name_ts_idx').on(t.name, t.ts)],
);
