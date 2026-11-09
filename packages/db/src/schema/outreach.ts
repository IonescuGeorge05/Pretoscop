import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export type OutreachPurpose = 'feed' | 'allowlist' | 'feed_or_allowlist' | 'partnership' | 'other';
export type OutreachChannel = 'email' | 'form' | 'phone' | 'meeting' | 'other';
export type OutreachStatus = 'planned' | 'sent' | 'replied' | 'agreed' | 'declined' | 'no_answer';

/**
 * Retailer outreach tracker (M21, setup C3): who we asked for a feed or an allowlisting, when,
 * and what they answered. `contact` is a business channel (a role address, a contact form, a
 * switchboard), not a private person's data. Sending stays with the founders.
 */
export const outreach = pgTable(
  'outreach',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    purpose: text('purpose').$type<OutreachPurpose>().notNull(),
    channel: text('channel').$type<OutreachChannel>().notNull(),
    contact: text('contact'),
    /** Template key from infra/bot-program/outreach-templates.md (e.g. `feed-listing-v1`). */
    template: text('template'),
    sentAt: ts('sent_at'),
    status: text('status').$type<OutreachStatus>().notNull().default('planned'),
    answer: text('answer'),
    nextStepAt: ts('next_step_at'),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('outreach_shop_idx').on(t.shopId, t.createdAt),
    check('outreach_purpose_ck', sql`${t.purpose} in ('feed','allowlist','feed_or_allowlist','partnership','other')`),
    check('outreach_channel_ck', sql`${t.channel} in ('email','form','phone','meeting','other')`),
    check('outreach_status_ck', sql`${t.status} in ('planned','sent','replied','agreed','declined','no_answer')`),
  ],
);
