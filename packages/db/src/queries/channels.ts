import { createHash } from 'node:crypto';
import { foldLower, VERDICT_MIN_DAYS } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { numericToBani } from '../money';
import { ELIGIBLE_ALERT_OFFER } from './alerts';

/**
 * Push and Telegram channels (M27). Each channel's consent lives with it (text version and time)
 * and in the evidence ledger (`consent_records`, purposes alert_push / alert_telegram). Losing a
 * channel (last subscription expired, bot blocked, unlinked) pauses the alerts that used it.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;

async function pauseChannel(tx: Exec, userId: string, channel: 'push' | 'telegram'): Promise<void> {
  await tx.execute(sql`
    UPDATE alerts SET status = 'paused', paused_reason = 'channel_unavailable', updated_at = now()
    WHERE user_id = ${userId} AND channel = ${channel} AND status = 'active'`);
}

async function resumeChannel(tx: Exec, userId: string, channel: 'push' | 'telegram'): Promise<void> {
  await tx.execute(sql`
    UPDATE alerts SET status = 'active', paused_reason = NULL, updated_at = now()
    WHERE user_id = ${userId} AND channel = ${channel} AND status = 'paused' AND paused_reason = 'channel_unavailable'`);
}

async function withdrawChannel(tx: Exec, userId: string, purpose: 'alert_push' | 'alert_telegram', method: string): Promise<void> {
  await tx.execute(sql`
    UPDATE consent_records SET withdrawn_at = now(), withdraw_method = ${method}
    WHERE user_id = ${userId} AND purpose = ${purpose} AND alert_id IS NULL AND withdrawn_at IS NULL`);
}

// ---------------------------------------------------------------------------------------------
// Web Push

export interface PushSubscriptionRow {
  id: number;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel: string | null;
  consentTextVersion: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
}

/** Browsers one account may keep subscribed; a new one beyond this replaces the oldest. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

/**
 * Stores a browser subscription with its consent (the box next to "Activează notificările" and the
 * browser's own permission). An endpoint already stored for another account moves to this one (the
 * same browser, another login). At most `MAX_PUSH_SUBSCRIPTIONS_PER_USER` per account.
 */
export async function savePushSubscription(
  db: Db,
  i: { userId: string; endpoint: string; p256dh: string; auth: string; deviceLabel: string | null; consentTextVersion: string; emailHash: string | null; ipHash: string | null },
): Promise<number> {
  return db.transaction(async (tx) => {
    const prev = await tx.execute<{ user_id: string }>(sql`SELECT user_id FROM push_subscriptions WHERE endpoint = ${i.endpoint} FOR UPDATE`);
    const other = prev.rows[0]?.user_id;
    if (other && other !== i.userId) {
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${i.endpoint}`);
      const left = await tx.execute(sql`SELECT 1 FROM push_subscriptions WHERE user_id = ${other} LIMIT 1`);
      if (left.rows.length === 0) {
        await pauseChannel(tx, other, 'push');
        await withdrawChannel(tx, other, 'alert_push', 'replaced');
      }
    }
    const r = await tx.execute<{ id: string }>(sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_label, consent_at, consent_text_version)
      VALUES (${i.userId}, ${i.endpoint}, ${i.p256dh}, ${i.auth}, ${i.deviceLabel}, now(), ${i.consentTextVersion})
      ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        device_label = EXCLUDED.device_label, consent_at = now(), consent_text_version = EXCLUDED.consent_text_version, failures = 0
      RETURNING id::text`);
    await tx.execute(sql`
      INSERT INTO consent_records (user_id, email_hash, purpose, text_version, given_at, given_ip_hash, confirmed_at, confirm_ip_hash, confirm_method)
      VALUES (${i.userId}, ${i.emailHash}, 'alert_push', ${i.consentTextVersion}, now(), ${i.ipHash}, now(), ${i.ipHash}, 'session')`);
    const id = Number(r.rows[0]!.id);
    await tx.execute(sql`
      DELETE FROM push_subscriptions WHERE user_id = ${i.userId} AND id NOT IN (
        SELECT id FROM push_subscriptions WHERE user_id = ${i.userId} ORDER BY consent_at DESC, id DESC LIMIT ${MAX_PUSH_SUBSCRIPTIONS_PER_USER})`);
    await resumeChannel(tx, i.userId, 'push');
    await tx.execute(sql`UPDATE users SET last_active_at = now(), retention_notice_at = NULL WHERE id = ${i.userId}`);
    return id;
  });
}

export async function userPushSubscriptions(db: Exec, userId: string): Promise<PushSubscriptionRow[]> {
  const r = await db.execute<{
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    device_label: string | null;
    consent_text_version: string;
    created_at: string;
    last_success_at: string | null;
  }>(sql`
    SELECT id::text, user_id, endpoint, p256dh, auth, device_label, consent_text_version, created_at, last_success_at
    FROM push_subscriptions WHERE user_id = ${userId} ORDER BY id`);
  return r.rows.map((x) => ({
    id: Number(x.id),
    userId: x.user_id,
    endpoint: x.endpoint,
    p256dh: x.p256dh,
    auth: x.auth,
    deviceLabel: x.device_label,
    consentTextVersion: x.consent_text_version,
    createdAt: new Date(x.created_at),
    lastSuccessAt: x.last_success_at === null ? null : new Date(x.last_success_at),
  }));
}

/** What /alerte lists about a user's browsers (no endpoint, no keys). */
export interface PushDevice {
  id: number;
  deviceLabel: string | null;
  consentTextVersion: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
}

export async function userPushDevices(db: Exec, userId: string): Promise<PushDevice[]> {
  const r = await db.execute<{ id: string; device_label: string | null; consent_text_version: string; created_at: string; last_success_at: string | null }>(sql`
    SELECT id::text, device_label, consent_text_version, created_at, last_success_at FROM push_subscriptions WHERE user_id = ${userId} ORDER BY id`);
  return r.rows.map((x) => ({
    id: Number(x.id),
    deviceLabel: x.device_label,
    consentTextVersion: x.consent_text_version,
    createdAt: new Date(x.created_at),
    lastSuccessAt: x.last_success_at === null ? null : new Date(x.last_success_at),
  }));
}

/**
 * Removes a subscription (the user turned it off, or the push service says it is gone). Without
 * any subscription left, the user's push alerts pause and the push consent is withdrawn.
 */
export async function deletePushSubscription(db: Db, where: { userId: string; endpoint?: string; id?: number }, method: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const cond = where.id !== undefined ? sql`id = ${where.id}` : sql`endpoint = ${where.endpoint ?? ''}`;
    const r = await tx.execute<{ id: string }>(sql`DELETE FROM push_subscriptions WHERE user_id = ${where.userId} AND ${cond} RETURNING id::text`);
    if (r.rows.length === 0) return false;
    const left = await tx.execute(sql`SELECT 1 FROM push_subscriptions WHERE user_id = ${where.userId} LIMIT 1`);
    if (left.rows.length === 0) {
      await pauseChannel(tx, where.userId, 'push');
      await withdrawChannel(tx, where.userId, 'alert_push', method);
    }
    return true;
  });
}

export async function markPushResult(db: Exec, id: number, ok: boolean): Promise<void> {
  await db.execute(
    ok
      ? sql`UPDATE push_subscriptions SET last_success_at = now(), failures = 0 WHERE id = ${id}`
      : sql`UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ${id}`,
  );
}

// ---------------------------------------------------------------------------------------------
// Delivery receipts (idempotency of push and Telegram sends)

/** True when this message (key) already reached this target ('push:<id>' or 'telegram'). */
export async function hasDeliveryReceipt(db: Exec, idempotencyKey: string, target: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM channel_deliveries WHERE idempotency_key = ${idempotencyKey} AND target = ${target}`);
  return r.rows.length > 0;
}

/** Records a delivery right after the provider accepted it. */
export async function recordDeliveryReceipt(db: Exec, idempotencyKey: string, target: string, ref: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO channel_deliveries (idempotency_key, target, ref) VALUES (${idempotencyKey}, ${target}, ${ref}) ON CONFLICT DO NOTHING`);
}

/** Receipts older than `days` (retries end within hours). */
export async function pruneDeliveryReceipts(db: Exec, days = 7): Promise<number> {
  const r = await db.execute(sql`DELETE FROM channel_deliveries WHERE created_at < now() - make_interval(days => ${days}::int)`);
  return r.rowCount ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Telegram

export const telegramTokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Starts linking: the raw token goes into the t.me deep link; only its hash is stored (15 minutes). */
export async function createTelegramLinkToken(db: Exec, userId: string, token: string, consentTextVersion: string, ttlMinutes = 15): Promise<void> {
  await db.execute(sql`DELETE FROM telegram_link_tokens WHERE user_id = ${userId} OR expires_at < now()`);
  await db.execute(sql`
    INSERT INTO telegram_link_tokens (token_hash, user_id, consent_at, consent_text_version, expires_at)
    VALUES (${telegramTokenHash(token)}, ${userId}, now(), ${consentTextVersion}, now() + make_interval(mins => ${ttlMinutes}::int))`);
}

/**
 * `/start <token>`: links the chat to the account that asked for the link (a chat linked to
 * another account moves). Single use; returns null for unknown or expired tokens.
 */
export async function consumeTelegramLinkToken(
  db: Db,
  tokenHash: string,
  chatId: number,
  hashEmail: (email: string) => string,
): Promise<{ userId: string; relinked: boolean } | null> {
  return db.transaction(async (tx) => {
    const t = await tx.execute<{ user_id: string; consent_at: Date; consent_text_version: string; email: string }>(sql`
      SELECT t.user_id, t.consent_at, t.consent_text_version, u.email
      FROM telegram_link_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ${tokenHash} AND t.expires_at > now() FOR UPDATE OF t`);
    const row = t.rows[0];
    if (!row) return null;
    await tx.execute(sql`DELETE FROM telegram_link_tokens WHERE token_hash = ${tokenHash}`);
    const moved = await tx.execute<{ user_id: string }>(sql`DELETE FROM telegram_links WHERE chat_id = ${chatId} AND user_id <> ${row.user_id} RETURNING user_id`);
    for (const m of moved.rows) {
      await pauseChannel(tx, m.user_id, 'telegram');
      await withdrawChannel(tx, m.user_id, 'alert_telegram', 'replaced');
    }
    const prev = await tx.execute(sql`SELECT 1 FROM telegram_links WHERE user_id = ${row.user_id}`);
    await tx.execute(sql`
      INSERT INTO telegram_links (user_id, chat_id, status, consent_at, consent_text_version)
      VALUES (${row.user_id}, ${chatId}, 'active', ${row.consent_at}, ${row.consent_text_version})
      ON CONFLICT (user_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, status = 'active', consent_at = EXCLUDED.consent_at,
        consent_text_version = EXCLUDED.consent_text_version, linked_at = now(), last_error = NULL`);
    await tx.execute(sql`
      INSERT INTO consent_records (user_id, email_hash, purpose, text_version, given_at, confirmed_at, confirm_method)
      VALUES (${row.user_id}, ${hashEmail(row.email)}, 'alert_telegram', ${row.consent_text_version}, ${row.consent_at}, now(), 'telegram')`);
    await resumeChannel(tx, row.user_id, 'telegram');
    await tx.execute(sql`UPDATE users SET last_active_at = now(), retention_notice_at = NULL WHERE id = ${row.user_id}`);
    return { userId: row.user_id, relinked: prev.rows.length > 0 };
  });
}

export interface TelegramLink {
  userId: string;
  email: string;
  chatId: number;
  status: 'active' | 'blocked';
  consentTextVersion: string;
  linkedAt: Date;
}

const LINK = sql`SELECT l.user_id, u.email, l.chat_id::text, l.status, l.consent_text_version, l.linked_at FROM telegram_links l JOIN users u ON u.id = l.user_id`;
type LinkRow = { user_id: string; email: string; chat_id: string; status: 'active' | 'blocked'; consent_text_version: string; linked_at: string };
const toLink = (r: LinkRow): TelegramLink => ({ userId: r.user_id, email: r.email, chatId: Number(r.chat_id), status: r.status, consentTextVersion: r.consent_text_version, linkedAt: new Date(r.linked_at) });

export async function telegramLinkByChat(db: Exec, chatId: number): Promise<TelegramLink | null> {
  const r = await db.execute<LinkRow>(sql`${LINK} WHERE l.chat_id = ${chatId}`);
  return r.rows[0] ? toLink(r.rows[0]) : null;
}

export async function telegramLinkByUser(db: Exec, userId: string): Promise<TelegramLink | null> {
  const r = await db.execute<LinkRow>(sql`${LINK} WHERE l.user_id = ${userId}`);
  return r.rows[0] ? toLink(r.rows[0]) : null;
}

/** `/oprire` or "Deconectează": the link goes, Telegram alerts pause, the consent is withdrawn. */
export async function unlinkTelegram(db: Db, userId: string, method: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`DELETE FROM telegram_links WHERE user_id = ${userId} RETURNING user_id`);
    await pauseChannel(tx, userId, 'telegram');
    await withdrawChannel(tx, userId, 'alert_telegram', method);
    return r.rows.length > 0;
  });
}

/** The person blocked the bot: stop writing; alerts on Telegram pause until they link again. */
export async function markTelegramBlocked(db: Db, userId: string, error: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE telegram_links SET status = 'blocked', last_error = ${error.slice(0, 300)} WHERE user_id = ${userId}`);
    await pauseChannel(tx, userId, 'telegram');
  });
}

export async function pruneTelegramLinkTokens(db: Exec): Promise<number> {
  const r = await db.execute<{ token_hash: string }>(sql`DELETE FROM telegram_link_tokens WHERE expires_at < now() RETURNING token_hash`);
  return r.rows.length;
}

/** "/urmareste iphone 17 pro": active products whose title holds every word (folded), most offers first. */
export async function searchProductsForBot(db: Exec, query: string, limit = 5): Promise<Array<{ id: number; slug: string; title: string; minTotalBani: number | null }>> {
  const words = foldLower(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2)
    .slice(0, 6);
  if (words.length === 0) return [];
  const conds = sql.join(
    words.map((w) => sql`p.title_ascii ILIKE ${`%${w}%`}`),
    sql` AND `,
  );
  const r = await db.execute<{ id: string; slug: string; title: string; min_total: string | null }>(sql`
    SELECT p.id::text, p.slug, p.title, p.min_total_price::text AS min_total FROM products p
    WHERE p.status = 'active' AND ${conds}
    ORDER BY p.offer_count DESC, length(p.title), p.id LIMIT ${limit}`);
  return r.rows.map((x) => ({ id: Number(x.id), slug: x.slug, title: x.title, minTotalBani: numericToBani(x.min_total) }));
}

// ---------------------------------------------------------------------------------------------
// Daily deals post

export interface VerifiedDropRow {
  productId: number;
  slug: string;
  title: string;
  totalBani: number;
  shopName: string;
  min30Bani: number;
  dropPct: number;
}

/**
 * Today's verified drops, by the M08 rules the product page uses (M15's deals rules are not merged
 * yet): verdict 'good_price' (today's best total is the lowest of the last 30 days), at least
 * `VERDICT_MIN_DAYS` (14) observed days (no badge on a shorter history), and today's total at least
 * `minDropPct` under the lowest daily total we observed in the 30 days before today. The offer must
 * be one an alert may speak about (`ELIGIBLE_ALERT_OFFER`: in stock, shop-sold, matched, trusted
 * shop, checked within the shop's freshness SLO, no pending quarantine), never on a provisional
 * product and never under 30% of the 90-day median (probable mismatch). Biggest drops first.
 */
export async function verifiedDrops(db: Exec, opts: { today: string; limit?: number; minDropPct?: number; minObservationDays?: number }): Promise<VerifiedDropRow[]> {
  const minDays = Math.max(opts.minObservationDays ?? VERDICT_MIN_DAYS, VERDICT_MIN_DAYS);
  const r = await db.execute<{ id: string; slug: string; title: string; cur: string; shop: string; prev: string }>(sql`
    WITH prev AS (
      SELECT product_id, min(min_total_price) AS m FROM product_daily
      WHERE day >= ${opts.today}::date - 30 AND day < ${opts.today}::date AND min_total_price IS NOT NULL
      GROUP BY product_id
    )
    SELECT p.id::text, p.slug, p.title, ps.current_min_total::text AS cur, s.name AS shop, prev.m::text AS prev
    FROM product_stats ps
    JOIN products p ON p.id = ps.product_id
    JOIN prev ON prev.product_id = ps.product_id
    JOIN offers o ON o.id = ps.current_min_offer_id
    JOIN shops s ON s.id = o.shop_id
    WHERE p.status = 'active' AND NOT p.provisional AND ps.current_min_total IS NOT NULL
      AND ps.verdict = 'good_price'
      AND ps.observations_days >= ${minDays}
      AND ${ELIGIBLE_ALERT_OFFER}
      AND o.total_price = ps.current_min_total
      AND ps.current_min_total * 100 <= prev.m * (100 - ${opts.minDropPct ?? 5})
      AND (ps.median_90d IS NULL OR ps.current_min_total >= ps.median_90d * 0.3)
    ORDER BY (prev.m - ps.current_min_total) / prev.m DESC, p.id
    LIMIT ${opts.limit ?? 10}`);
  return r.rows.map((x) => {
    const total = numericToBani(x.cur)!;
    const prev = numericToBani(x.prev)!;
    return { productId: Number(x.id), slug: x.slug, title: x.title, totalBani: total, shopName: x.shop, min30Bani: prev, dropPct: Math.floor(((prev - total) * 100) / prev) };
  });
}

/** Claims today's post for a channel (idempotent: a second claim the same day returns false). */
export async function claimChannelPost(db: Exec, channel: string, day: string): Promise<boolean> {
  const r = await db.execute(sql`INSERT INTO channel_posts (channel, day) VALUES (${channel}, ${day}::date) ON CONFLICT DO NOTHING RETURNING channel`);
  return r.rows.length > 0;
}

export async function completeChannelPost(db: Exec, channel: string, day: string, messageId: string): Promise<void> {
  await db.execute(sql`UPDATE channel_posts SET message_id = ${messageId} WHERE channel = ${channel} AND day = ${day}::date`);
}

/** A post that failed to send gives the day back (the job's retry may post it). */
export async function releaseChannelPost(db: Exec, channel: string, day: string): Promise<void> {
  await db.execute(sql`DELETE FROM channel_posts WHERE channel = ${channel} AND day = ${day}::date AND message_id IS NULL`);
}
