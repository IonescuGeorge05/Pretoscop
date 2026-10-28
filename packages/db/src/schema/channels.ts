import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Notification channels besides email (M27). Each channel records its own consent (text version
 * and time; the ledger row lives in `consent_records` with purpose alert_push / alert_telegram).
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** One browser (Web Push subscription) of a user. The endpoint is the push service's URL. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** "Chrome · Android" so the owner recognizes the device; the User-Agent itself is not kept. */
    deviceLabel: text('device_label'),
    consentAt: ts('consent_at').notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSuccessAt: ts('last_success_at'),
    failures: smallint('failures').notNull().default(0),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint), index('push_subscriptions_user_idx').on(t.userId)],
);

export type TelegramLinkStatus = 'active' | 'blocked';

/** The Telegram chat a user linked with `/start <token>` (one chat per user, one user per chat). */
export const telegramLinks = pgTable(
  'telegram_links',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    status: text('status').$type<TelegramLinkStatus>().notNull().default('active'),
    consentAt: ts('consent_at').notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    linkedAt: ts('linked_at').notNull().defaultNow(),
    lastError: text('last_error'),
  },
  (t) => [uniqueIndex('telegram_links_chat_uq').on(t.chatId), check('telegram_links_status_ck', sql`${t.status} in ('active','blocked')`)],
);

/** One-time link tokens (15 minutes, stored as sha256): the consent box ticked on /alerte travels with them. */
export const telegramLinkTokens = pgTable(
  'telegram_link_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentAt: ts('consent_at').notNull(),
    /** Daily-salted hash of the IP that ticked the box (consent evidence, as for email and push). */
    consentIpHash: text('consent_ip_hash'),
    consentTextVersion: text('consent_text_version').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('telegram_link_tokens_user_idx').on(t.userId)],
);

/** Broadcasts already made (the daily deals post): at most one per channel and day. */
export const channelPosts = pgTable(
  'channel_posts',
  {
    channel: text('channel').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    messageId: text('message_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channel, t.day] })],
);

/**
 * Idempotency receipts of push and Telegram deliveries (M27): one row per message key (the
 * `alert_sends` ids it carries) and target ('push:<subscription id>' or 'telegram'). A retry of the
 * same rows (a timeout, a crash between sending and recording, one browser of several failing)
 * skips the targets that already got the message, as Resend's idempotency key does for email. No
 * personal data: the key is a hash and the target a subscription number. Pruned after 7 days.
 */
export const channelDeliveries = pgTable(
  'channel_deliveries',
  {
    idempotencyKey: text('idempotency_key').notNull(),
    target: text('target').notNull(),
    /** The provider's message reference (Telegram message id, push HTTP status). */
    ref: text('ref'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.idempotencyKey, t.target] }), index('channel_deliveries_created_idx').on(t.createdAt)],
);
