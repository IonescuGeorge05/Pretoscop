import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { products } from './catalog';

/**
 * Price alerts (M19, docs/03 §5.5 and §6.5). An alert belongs to a user (Better Auth `users`) and
 * watches one product (or, with `any_variant`, every active product of its family). It becomes
 * active only after the double opt-in (Law 506/2004 art. 12): the explicit, unticked consent box in
 * the form (`consent_*`) and the click on the confirmation link (`confirmed_*`), or a logged-in
 * session for the same, already verified address.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export type AlertKind = 'below' | 'any_drop';
export type AlertChannel = 'email' | 'push' | 'telegram';
export type AlertStatus = 'pending' | 'active' | 'paused';
export type AlertConfirmMethod = 'email_link' | 'session' | 'telegram';

export const alerts = pgTable(
  'alerts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** 'below': total ≤ target_price; 'any_drop': ≥ 1% under the last price we told the user. */
    kind: text('kind').$type<AlertKind>().notNull(),
    targetPrice: money('target_price'),
    /** Watch every active variant of the product's family (colour, storage…). */
    anyVariant: boolean('any_variant').notNull().default(false),
    channel: text('channel').$type<AlertChannel>().notNull().default('email'),
    status: text('status').$type<AlertStatus>().notNull().default('pending'),
    /** Why a paused alert is paused: 'user', 'channel_unavailable', 'bounce'. */
    pausedReason: text('paused_reason'),
    // Consent evidence (docs/03 §5.5): the ticked box, when, from where (daily-salted hash), which text.
    consentAt: ts('consent_at').notNull(),
    consentIpHash: text('consent_ip_hash'),
    consentTextVersion: text('consent_text_version').notNull(),
    // Double opt-in: the confirmation click (or the verified session / linked Telegram chat).
    confirmedAt: ts('confirmed_at'),
    confirmIpHash: text('confirm_ip_hash'),
    confirmMethod: text('confirm_method').$type<AlertConfirmMethod>(),
    confirmationSentAt: ts('confirmation_sent_at'),
    /** Reference for 'any_drop' when nothing was notified yet: the best total at confirmation. */
    baselineTotal: money('baseline_total'),
    /** 'below' only: true until a notification; re-armed when the total goes back above the target. */
    armed: boolean('armed').notNull().default(true),
    lastNotifiedAt: ts('last_notified_at'),
    lastNotifiedTotal: money('last_notified_total'),
    lastNotifiedOfferId: bigint('last_notified_offer_id', { mode: 'number' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('alerts_status_product_idx').on(t.status, t.productId),
    index('alerts_user_idx').on(t.userId),
    // One live alert per user, product and channel; a newer confirmed alert replaces the older one.
    uniqueIndex('alerts_user_product_channel_uq').on(t.userId, t.productId, t.channel).where(sql`${t.status} <> 'pending'`),
    check('alerts_kind_ck', sql`${t.kind} in ('below','any_drop')`),
    check('alerts_channel_ck', sql`${t.channel} in ('email','push','telegram')`),
    check('alerts_status_ck', sql`${t.status} in ('pending','active','paused')`),
    check('alerts_target_ck', sql`(${t.kind} <> 'below' OR ${t.targetPrice} IS NOT NULL) AND (${t.targetPrice} IS NULL OR ${t.targetPrice} > 0)`),
    check('alerts_confirm_method_ck', sql`${t.confirmMethod} IS NULL OR ${t.confirmMethod} in ('email_link','session','telegram')`),
  ],
);

export type AlertSendStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

/**
 * One notification for one alert (an outbox row). The evaluation claims the alert and queues the
 * row in one transaction; delivery batches a user's rows per channel into one message. `prev_state`
 * lets a send that could not be delivered give the alert its previous state back, so a failure
 * never counts as "notified".
 */
export const alertSends = pgTable(
  'alert_sends',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    alertId: bigint('alert_id', { mode: 'number' })
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<AlertChannel>().notNull(),
    /** The variant that triggered (differs from the alert's product for "any variant" alerts). */
    productId: bigint('product_id', { mode: 'number' }).notNull(),
    offerId: bigint('offer_id', { mode: 'number' }).notNull(),
    shopId: bigint('shop_id', { mode: 'number' }),
    price: money('price').notNull(),
    shippingCost: money('shipping_cost'),
    total: money('total').notNull(),
    /** The target ('below') or the previous price we told the user about ('any_drop'). */
    referenceTotal: money('reference_total'),
    /** 'below_target', 'lower_below_target', 'drop' (core `decideAlert`) or 'simulated'. */
    reason: text('reason').notNull(),
    /** The offer's last check when the alert was evaluated (shown in the message). */
    checkedAt: ts('checked_at').notNull(),
    status: text('status').$type<AlertSendStatus>().notNull().default('queued'),
    attempts: smallint('attempts').notNull().default(0),
    notBefore: ts('not_before').notNull().defaultNow(),
    error: text('error'),
    providerMessageId: text('provider_message_id'),
    /** `pnpm alerts:simulate`: a test message; never changes the alert's state. */
    simulated: boolean('simulated').notNull().default(false),
    prevState: jsonb('prev_state').$type<{ lastNotifiedAt: string | null; lastNotifiedTotal: string | null; lastNotifiedOfferId: number | null; armed: boolean }>(),
    createdAt: ts('created_at').notNull().defaultNow(),
    sentAt: ts('sent_at'),
  },
  (t) => [
    index('alert_sends_pending_idx').on(t.status, t.notBefore).where(sql`${t.status} in ('queued','sending')`),
    index('alert_sends_alert_idx').on(t.alertId),
    index('alert_sends_user_idx').on(t.userId),
    index('alert_sends_created_idx').on(t.createdAt),
    check('alert_sends_status_ck', sql`${t.status} in ('queued','sending','sent','failed','skipped')`),
    check('alert_sends_channel_ck', sql`${t.channel} in ('email','push','telegram')`),
  ],
);

export type ConsentPurpose = 'alert_email' | 'alert_push' | 'alert_telegram';

/**
 * Consent ledger (Law 506/2004 art. 12; GDPR art. 7(1)): the evidence outlives the alert and the
 * account for 3 years after withdrawal (privacy policy, `docs/legal/ropa.md` P5). The person is
 * identified by `email_hash` (HMAC with ALERTS_SECRET), so no address is kept after deletion.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    emailHash: text('email_hash'),
    purpose: text('purpose').$type<ConsentPurpose>().notNull(),
    alertId: bigint('alert_id', { mode: 'number' }),
    productId: bigint('product_id', { mode: 'number' }),
    textVersion: text('text_version').notNull(),
    givenAt: ts('given_at').notNull(),
    givenIpHash: text('given_ip_hash'),
    confirmedAt: ts('confirmed_at'),
    confirmIpHash: text('confirm_ip_hash'),
    confirmMethod: text('confirm_method'),
    withdrawnAt: ts('withdrawn_at'),
    /** 'unsubscribe_link', 'list_unsubscribe', 'account', 'account_deleted', 'complaint', 'bounce', 'retention', 'replaced', 'telegram', 'push_revoked', 'admin'. */
    withdrawMethod: text('withdraw_method'),
  },
  (t) => [
    index('consent_records_email_hash_idx').on(t.emailHash),
    index('consent_records_user_idx').on(t.userId),
    index('consent_records_alert_idx').on(t.alertId),
    check('consent_records_purpose_ck', sql`${t.purpose} in ('alert_email','alert_push','alert_telegram')`),
  ],
);

export type SuppressionReason = 'unsubscribed' | 'complaint' | 'bounce' | 'deleted';

/**
 * Addresses we must not email alerts to (HMAC hashes only, kept indefinitely: ROPA P5). A new
 * double opt-in lifts 'unsubscribed' and 'deleted'; 'complaint' and 'bounce' also block
 * confirmation emails until someone clears them by hand.
 */
export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    emailHash: text('email_hash').primaryKey(),
    reason: text('reason').$type<SuppressionReason>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [check('email_suppressions_reason_ck', sql`${t.reason} in ('unsubscribed','complaint','bounce','deleted')`)],
);
