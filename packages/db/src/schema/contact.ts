import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Messages from /contact, which doubles as the DSA notice-and-action channel (arts 11–12, 16) and
 * the shops' objection channel (stop within one business day). Kept as the audit trail; personal
 * data limited to what the sender typed (email optional except where a reply is required).
 */
export const contactRequests = pgTable(
  'contact_requests',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind').notNull(),
    email: text('email'),
    name: text('name'),
    subjectUrl: text('subject_url'),
    message: text('message').notNull(),
    status: text('status').notNull().default('new'),
    sessionHash: text('session_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    resolution: text('resolution'),
  },
  (t) => [
    index('contact_requests_status_idx').on(t.status, t.createdAt),
    check('contact_requests_kind_ck', sql`${t.kind} in ('general','price_error','shop_objection','illegal_content','privacy','merchant','press')`),
    check('contact_requests_status_ck', sql`${t.status} in ('new','in_progress','resolved','rejected')`),
  ],
);
