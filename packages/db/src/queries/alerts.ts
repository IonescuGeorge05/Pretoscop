import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { baniToNumeric, numericToBani } from '../money';
import type { AlertChannel, AlertKind, AlertStatus, ConsentPurpose, SuppressionReason } from '../schema/alerts';

/**
 * Price alerts (M19): every statement that touches `alerts`, `alert_sends`, `consent_records` and
 * `email_suppressions`. Callers hash addresses (`emailHash`, packages/notify) and IPs (daily salt);
 * this module never sees a raw IP.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;

/**
 * An offer an alert may speak about: active, in stock, new, matched, shop-sold (marketplace
 * sellers are a separate series, as in product_stats), from an active shop with trust tier ≤ 2,
 * checked within the shop's freshness SLO (product page "stale" rule, default 26 h) and without a
 * pending quarantine. Aliases: `o` = offers, `s` = shops.
 */
export const ELIGIBLE_ALERT_OFFER: SQL = sql.raw(`(
  o.active AND o.availability = 'in_stock' AND o.match_status IN ('auto','manual') AND o.condition = 'new'
  AND NOT o.is_bundle AND NOT o.is_accessory AND NOT o.blacklisted AND o.seller_type = 'shop'
  AND s.status = 'active' AND s.trust_tier <= 2 AND o.source_tier <= 2
  AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))
  AND NOT EXISTS (SELECT 1 FROM price_events_quarantine q WHERE q.offer_id = o.id AND q.status = 'pending')
)`);

/** Raw `execute` returns timestamptz as text ("2026-10-28 00:18:26.73+00"): convert at the edge. */
const toDate = (v: Date | string | null | undefined): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(v));
const toDateNN = (v: Date | string): Date => toDate(v)!;

const purposeOf = (channel: AlertChannel): ConsentPurpose => (channel === 'email' ? 'alert_email' : channel === 'push' ? 'alert_push' : 'alert_telegram');
const bani = (v: string | null | undefined): number | null => numericToBani(v ?? null);
const money = (b: number | null): string | null => (b === null ? null : baniToNumeric(b));

export interface BestAlertOffer {
  offerId: number;
  productId: number;
  shopId: number;
  shopName: string;
  priceBani: number;
  shippingBani: number | null;
  shippingEstimated: boolean;
  totalBani: number;
  checkedAt: Date;
}

/** The best eligible offer for a product (or its whole family): the price an alert starts from. */
export async function bestAlertOffer(db: Exec, productId: number, anyVariant = false): Promise<BestAlertOffer | null> {
  const scope = anyVariant
    ? sql`o.product_id IN (SELECT v.id FROM products v JOIN products p ON p.family_id = v.family_id WHERE p.id = ${productId} AND v.status = 'active' UNION SELECT ${productId}::bigint)`
    : sql`o.product_id = ${productId}`;
  const r = await db.execute<{ id: string; product_id: string; shop_id: string; shop_name: string; price: string; shipping_cost: string | null; shipping_estimated: boolean; total: string; checked: Date }>(sql`
    SELECT o.id::text, o.product_id::text, o.shop_id::text, s.name AS shop_name, o.price::text, o.shipping_cost::text, o.shipping_estimated,
      o.total_price::text AS total, o.last_checked_at AS checked
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE ${scope} AND ${ELIGIBLE_ALERT_OFFER}
    ORDER BY o.total_price ASC, o.last_checked_at DESC, o.id
    LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return null;
  return {
    offerId: Number(row.id),
    productId: Number(row.product_id),
    shopId: Number(row.shop_id),
    shopName: row.shop_name,
    priceBani: bani(row.price)!,
    shippingBani: bani(row.shipping_cost),
    shippingEstimated: row.shipping_estimated,
    totalBani: bani(row.total)!,
    checkedAt: new Date(row.checked),
  };
}

export interface AlertProduct {
  id: number;
  slug: string;
  title: string;
  status: string;
  familyId: number | null;
  /** Active products of the family (1 when the product has no family). */
  variants: number;
}

/** The product an alert form refers to; a merged product resolves to its target. */
export async function alertProduct(db: Exec, productId: number): Promise<AlertProduct | null> {
  let id = productId;
  for (let hop = 0; hop < 5; hop++) {
    const r = await db.execute<{ id: string; slug: string; title: string; status: string; family_id: string | null; merged_into_id: string | null; variants: string }>(sql`
      SELECT p.id::text, p.slug, p.title, p.status, p.family_id::text, p.merged_into_id::text,
        (SELECT count(*) FROM products v WHERE p.family_id IS NOT NULL AND v.family_id = p.family_id AND v.status = 'active')::text AS variants
      FROM products p WHERE p.id = ${id}
    `);
    const row = r.rows[0];
    if (!row) return null;
    if (row.status === 'merged' && row.merged_into_id) {
      id = Number(row.merged_into_id);
      continue;
    }
    return { id: Number(row.id), slug: row.slug, title: row.title, status: row.status, familyId: row.family_id ? Number(row.family_id) : null, variants: Math.max(1, Number(row.variants)) };
  }
  return null;
}

export interface NewAlertInput {
  userId: string;
  productId: number;
  kind: AlertKind;
  targetBani: number | null;
  anyVariant: boolean;
  channel: AlertChannel;
  consentAt: Date;
  consentIpHash: string | null;
  consentTextVersion: string;
  /** Stable pseudonym of the address (consent ledger); null for channels without an address. */
  emailHash: string | null;
  /**
   * Active at once, without the email link: a logged-in session for the same verified address, or
   * a linked Telegram chat (M27). The pending path sends the double opt-in email instead.
   */
  confirm?: { method: 'session' | 'telegram'; ipHash: string | null };
}

/** Withdraws the consent records of alerts that are about to disappear. */
async function withdrawConsents(tx: Exec, where: SQL, method: string): Promise<void> {
  await tx.execute(sql`UPDATE consent_records SET withdrawn_at = now(), withdraw_method = ${method} WHERE withdrawn_at IS NULL AND ${where}`);
}

/** A newer live alert for the same user, product and channel replaces the older one (`alertId` 0: all). */
async function replaceOlder(tx: Exec, alertId: number, userId: string, productId: number, channel: AlertChannel): Promise<void> {
  const older = sql`alert_id IN (SELECT id FROM alerts WHERE user_id = ${userId} AND product_id = ${productId} AND channel = ${channel} AND status <> 'pending' AND id <> ${alertId})`;
  await withdrawConsents(tx, older, 'replaced');
  await tx.execute(sql`DELETE FROM alerts WHERE user_id = ${userId} AND product_id = ${productId} AND channel = ${channel} AND status <> 'pending' AND id <> ${alertId}`);
}

/** Creates an alert and its consent record; pending unless `confirm` says it is proven already. */
export async function createAlert(db: Db, i: NewAlertInput): Promise<{ alertId: number; status: AlertStatus }> {
  return db.transaction(async (tx) => {
    const active = i.confirm !== undefined;
    // The live alert this one replaces must go first (unique per user, product and channel).
    if (active) await replaceOlder(tx, 0, i.userId, i.productId, i.channel);
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO alerts (user_id, product_id, kind, target_price, any_variant, channel, status, consent_at, consent_ip_hash, consent_text_version,
        confirmed_at, confirm_ip_hash, confirm_method)
      VALUES (${i.userId}, ${i.productId}, ${i.kind}, ${money(i.targetBani)}, ${i.anyVariant}, ${i.channel}, ${active ? 'active' : 'pending'},
        ${i.consentAt}, ${i.consentIpHash}, ${i.consentTextVersion},
        ${active ? sql`now()` : null}, ${i.confirm?.ipHash ?? null}, ${i.confirm?.method ?? null})
      RETURNING id::text
    `);
    const alertId = Number(ins.rows[0]!.id);
    await tx.execute(sql`
      INSERT INTO consent_records (user_id, email_hash, purpose, alert_id, product_id, text_version, given_at, given_ip_hash, confirmed_at, confirm_ip_hash, confirm_method)
      VALUES (${i.userId}, ${i.emailHash}, ${purposeOf(i.channel)}, ${alertId}, ${i.productId}, ${i.consentTextVersion}, ${i.consentAt}, ${i.consentIpHash},
        ${active ? sql`now()` : null}, ${i.confirm?.ipHash ?? null}, ${i.confirm?.method ?? null})
    `);
    if (active) {
      const best = await bestAlertOffer(tx, i.productId, i.anyVariant);
      await tx.execute(sql`UPDATE alerts SET baseline_total = ${money(best?.totalBani ?? null)} WHERE id = ${alertId}`);
      await tx.execute(sql`UPDATE users SET last_active_at = now(), retention_notice_at = NULL WHERE id = ${i.userId}`);
      if (i.emailHash && i.channel === 'email') await liftSuppression(tx, i.emailHash);
    }
    return { alertId, status: active ? 'active' : 'pending' };
  });
}

export async function markConfirmationSent(db: Exec, alertId: number): Promise<void> {
  await db.execute(sql`UPDATE alerts SET confirmation_sent_at = now() WHERE id = ${alertId}`);
}

/** How many confirmation emails went to this user recently (anti-abuse: one form, many addresses). */
export async function recentConfirmationCount(db: Exec, userId: string, hours = 24): Promise<number> {
  const r = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n FROM alerts WHERE user_id = ${userId} AND confirmation_sent_at > now() - make_interval(hours => ${hours}::int)`);
  return Number(r.rows[0]?.n ?? 0);
}

export interface AlertView {
  id: number;
  userId: string;
  email: string;
  productId: number;
  productSlug: string;
  productTitle: string;
  kind: AlertKind;
  targetBani: number | null;
  anyVariant: boolean;
  channel: AlertChannel;
  status: AlertStatus;
  pausedReason: string | null;
  baselineBani: number | null;
  lastNotifiedAt: Date | null;
  lastNotifiedBani: number | null;
  consentAt: Date;
  consentTextVersion: string;
  confirmedAt: Date | null;
  confirmMethod: string | null;
  createdAt: Date;
}

const ALERT_VIEW = sql`
  SELECT a.id::text, a.user_id, u.email, a.product_id::text, p.slug AS product_slug, p.title AS product_title, a.kind, a.target_price::text AS target,
    a.any_variant, a.channel, a.status, a.paused_reason, a.baseline_total::text AS baseline, a.last_notified_at, a.last_notified_total::text AS last_total,
    a.consent_at, a.consent_text_version, a.confirmed_at, a.confirm_method, a.created_at
  FROM alerts a JOIN users u ON u.id = a.user_id JOIN products p ON p.id = a.product_id`;

type AlertViewRow = {
  id: string; user_id: string; email: string; product_id: string; product_slug: string; product_title: string; kind: AlertKind; target: string | null;
  any_variant: boolean; channel: AlertChannel; status: AlertStatus; paused_reason: string | null; baseline: string | null; last_notified_at: Date | null;
  last_total: string | null; consent_at: Date; consent_text_version: string; confirmed_at: Date | null; confirm_method: string | null; created_at: Date;
};

function toView(r: AlertViewRow): AlertView {
  return {
    id: Number(r.id),
    userId: r.user_id,
    email: r.email,
    productId: Number(r.product_id),
    productSlug: r.product_slug,
    productTitle: r.product_title,
    kind: r.kind,
    targetBani: bani(r.target),
    anyVariant: r.any_variant,
    channel: r.channel,
    status: r.status,
    pausedReason: r.paused_reason,
    baselineBani: bani(r.baseline),
    lastNotifiedAt: toDate(r.last_notified_at),
    lastNotifiedBani: bani(r.last_total),
    consentAt: toDateNN(r.consent_at),
    consentTextVersion: r.consent_text_version,
    confirmedAt: toDate(r.confirmed_at),
    confirmMethod: r.confirm_method,
    createdAt: toDateNN(r.created_at),
  };
}

export async function getAlert(db: Exec, alertId: number): Promise<AlertView | null> {
  const r = await db.execute<AlertViewRow>(sql`${ALERT_VIEW} WHERE a.id = ${alertId}`);
  return r.rows[0] ? toView(r.rows[0]) : null;
}

/** Every alert of a user, newest first (the /alerte page). */
export async function userAlerts(db: Exec, userId: string): Promise<AlertView[]> {
  const r = await db.execute<AlertViewRow>(sql`${ALERT_VIEW} WHERE a.user_id = ${userId} ORDER BY a.created_at DESC, a.id DESC`);
  return r.rows.map(toView);
}

/** Removes 'unsubscribed' and 'deleted' suppressions after a new, proven opt-in. */
async function liftSuppression(tx: Exec, emailHash: string): Promise<void> {
  await tx.execute(sql`DELETE FROM email_suppressions WHERE email_hash = ${emailHash} AND reason IN ('unsubscribed','deleted')`);
}

export type ConfirmOutcome = 'confirmed' | 'already' | 'expired' | 'missing';

/**
 * The double opt-in click: activates a pending alert (replacing an older live one for the same
 * product and channel), records when and from where, marks the address verified and starts the
 * 'any_drop' baseline from today's best total.
 */
export async function confirmAlert(
  db: Db,
  alertId: number,
  opts: { ipHash: string | null; method: 'email_link' | 'session'; ttlDays: number; emailHash: string | null },
): Promise<ConfirmOutcome> {
  return db.transaction(async (tx) => {
    const r = await tx.execute<{ status: AlertStatus; user_id: string; product_id: string; channel: AlertChannel; any_variant: boolean; expired: boolean }>(sql`
      SELECT status, user_id, product_id::text, channel, any_variant, created_at < now() - make_interval(days => ${opts.ttlDays}::int) AS expired
      FROM alerts WHERE id = ${alertId} FOR UPDATE`);
    const a = r.rows[0];
    if (!a) return 'missing';
    if (a.status !== 'pending') return 'already';
    if (a.expired) return 'expired';
    const productId = Number(a.product_id);
    await replaceOlder(tx, alertId, a.user_id, productId, a.channel);
    const best = await bestAlertOffer(tx, productId, a.any_variant);
    await tx.execute(sql`
      UPDATE alerts SET status = 'active', confirmed_at = now(), confirm_ip_hash = ${opts.ipHash}, confirm_method = ${opts.method},
        baseline_total = ${money(best?.totalBani ?? null)}, updated_at = now()
      WHERE id = ${alertId}`);
    await tx.execute(sql`
      UPDATE consent_records SET confirmed_at = now(), confirm_ip_hash = ${opts.ipHash}, confirm_method = ${opts.method}
      WHERE alert_id = ${alertId} AND confirmed_at IS NULL`);
    await tx.execute(sql`UPDATE users SET email_verified = true, last_active_at = now(), retention_notice_at = NULL, updated_at = now() WHERE id = ${a.user_id}`);
    if (opts.emailHash) await liftSuppression(tx, opts.emailHash);
    return 'confirmed';
  });
}

/** Deletes one alert (consent withdrawn with `method`); with `userId`, only if it belongs to that user. */
export async function deleteAlert(db: Db, alertId: number, opts: { method: string; userId?: string }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const owner = opts.userId === undefined ? sql`` : sql`AND user_id = ${opts.userId}`;
    const r = await tx.execute<{ id: string }>(sql`SELECT id::text FROM alerts WHERE id = ${alertId} ${owner} FOR UPDATE`);
    if (!r.rows[0]) return false;
    await withdrawConsents(tx, sql`alert_id = ${alertId}`, opts.method);
    await tx.execute(sql`DELETE FROM alerts WHERE id = ${alertId}`);
    return true;
  });
}

const SUPPRESSION_RANK: Record<SuppressionReason, number> = { deleted: 1, unsubscribed: 2, bounce: 3, complaint: 4 };

/** Adds an address to the suppression list, never weakening an existing, stronger reason. */
export async function suppressEmail(db: Exec, emailHash: string, reason: SuppressionReason): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_suppressions (email_hash, reason) VALUES (${emailHash}, ${reason})
    ON CONFLICT (email_hash) DO UPDATE SET reason = EXCLUDED.reason, created_at = now()
    WHERE (CASE email_suppressions.reason WHEN 'deleted' THEN 1 WHEN 'unsubscribed' THEN 2 WHEN 'bounce' THEN 3 ELSE 4 END) < ${SUPPRESSION_RANK[reason]}`);
}

export async function suppressionReason(db: Exec, emailHash: string): Promise<SuppressionReason | null> {
  const r = await db.execute<{ reason: SuppressionReason }>(sql`SELECT reason FROM email_suppressions WHERE email_hash = ${emailHash}`);
  return r.rows[0]?.reason ?? null;
}

/** An account (alias `u`) with nothing left that could notify its owner. */
const NOTHING_LEFT = sql.raw(`NOT EXISTS (SELECT 1 FROM alerts a WHERE a.user_id = u.id)`);

/** Deletes a 'user' account that has nothing left: no alerts and no other channel. */
async function deleteIfEmpty(tx: Exec, userId: string): Promise<boolean> {
  const r = await tx.execute<{ id: string }>(sql`
    DELETE FROM users u WHERE u.id = ${userId} AND u.role = 'user' AND ${NOTHING_LEFT}
    RETURNING u.id`);
  return r.rows.length > 0;
}

/**
 * "Stop all alerts" from an email (link, List-Unsubscribe one-click, complaint, bounce): deletes
 * the user's email alerts and pending requests, records the withdrawal, suppresses the address,
 * and deletes the account when nothing else is left (only the address hash remains).
 */
export async function unsubscribeAllEmail(
  db: Db,
  userId: string,
  opts: { method: string; emailHash: string; suppress: SuppressionReason },
): Promise<{ removed: number; userDeleted: boolean }> {
  return db.transaction(async (tx) => {
    const target = sql`user_id = ${userId} AND (channel = 'email' OR status = 'pending')`;
    await withdrawConsents(tx, sql`alert_id IN (SELECT id FROM alerts WHERE ${target})`, opts.method);
    const del = await tx.execute<{ id: string }>(sql`DELETE FROM alerts WHERE ${target} RETURNING id::text`);
    await suppressEmail(tx, opts.emailHash, opts.suppress);
    const userDeleted = await deleteIfEmpty(tx, userId);
    return { removed: del.rows.length, userDeleted };
  });
}

/** "Stop all" from the account page: every alert of the user goes, the account stays. */
export async function deleteAllAlerts(db: Db, userId: string, opts: { method: string }): Promise<number> {
  return db.transaction(async (tx) => {
    await withdrawConsents(tx, sql`alert_id IN (SELECT id FROM alerts WHERE user_id = ${userId})`, opts.method);
    const r = await tx.execute<{ id: string }>(sql`DELETE FROM alerts WHERE user_id = ${userId} RETURNING id::text`);
    return r.rows.length;
  });
}

/** Deletes a user and everything attached (self-service or a data-subject request). */
export async function deleteUserData(db: Db, userId: string, opts: { method: string; emailHash: string | null }): Promise<boolean> {
  return db.transaction(async (tx) => {
    await withdrawConsents(tx, sql`user_id = ${userId}`, opts.method);
    if (opts.emailHash) await suppressEmail(tx, opts.emailHash, 'deleted');
    const r = await tx.execute<{ id: string }>(sql`DELETE FROM users WHERE id = ${userId} RETURNING id`);
    return r.rows.length > 0;
  });
}

/** Marks activity (login, alert edits, "keep my account"): resets the 24-month retention clock. */
export async function touchUserActivity(db: Exec, userId: string): Promise<void> {
  await db.execute(sql`UPDATE users SET last_active_at = now(), retention_notice_at = NULL WHERE id = ${userId}`);
}

/** Edits a user's own alert (kind, target, channel). Returns false when it is not theirs. */
export async function updateAlert(
  db: Db,
  alertId: number,
  userId: string,
  patch: { kind: AlertKind; targetBani: number | null; channel?: AlertChannel; consent?: { textVersion: string; ipHash: string | null; emailHash: string | null } },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx.execute<{ product_id: string; channel: AlertChannel; any_variant: boolean; status: AlertStatus }>(sql`
      SELECT product_id::text, channel, any_variant, status FROM alerts WHERE id = ${alertId} AND user_id = ${userId} FOR UPDATE`);
    const a = r.rows[0];
    if (!a) return false;
    const channel = patch.channel ?? a.channel;
    if (channel !== a.channel && a.status !== 'pending') await replaceOlder(tx, alertId, userId, Number(a.product_id), channel);
    const best = await bestAlertOffer(tx, Number(a.product_id), a.any_variant);
    // A new condition starts from today's price: no notification about the old one is pending.
    await tx.execute(sql`
      UPDATE alerts SET kind = ${patch.kind}, target_price = ${money(patch.targetBani)}, channel = ${channel},
        armed = true, last_notified_at = NULL, last_notified_total = NULL, last_notified_offer_id = NULL,
        baseline_total = ${money(best?.totalBani ?? null)},
        status = CASE WHEN status = 'paused' AND paused_reason = 'channel_unavailable' AND channel <> ${channel} THEN 'active' ELSE status END,
        paused_reason = CASE WHEN status = 'paused' AND paused_reason = 'channel_unavailable' AND channel <> ${channel} THEN NULL ELSE paused_reason END,
        updated_at = now()
      WHERE id = ${alertId}`);
    if (patch.consent) {
      await tx.execute(sql`
        INSERT INTO consent_records (user_id, email_hash, purpose, alert_id, product_id, text_version, given_at, given_ip_hash, confirmed_at, confirm_ip_hash, confirm_method)
        VALUES (${userId}, ${patch.consent.emailHash}, ${purposeOf(channel)}, ${alertId}, ${Number(a.product_id)}, ${patch.consent.textVersion}, now(),
          ${patch.consent.ipHash}, now(), ${patch.consent.ipHash}, 'session')`);
    }
    await tx.execute(sql`UPDATE users SET last_active_at = now(), retention_notice_at = NULL WHERE id = ${userId}`);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Evaluation

export interface AlertCandidate {
  alertId: number;
  userId: string;
  channel: AlertChannel;
  kind: AlertKind;
  anyVariant: boolean;
  alertProductId: number;
  targetBani: number | null;
  baselineBani: number | null;
  armed: boolean;
  lastNotifiedAt: Date | null;
  /** Exact database text of the state, for the compare-and-set. */
  state: { lastNotifiedAt: string | null; lastNotifiedTotal: string | null; lastNotifiedOfferId: number | null; armed: boolean };
  lastNotifiedBani: number | null;
  best: (BestAlertOffer & { crossShopMedianBani: number | null }) | null;
}

/**
 * Active alerts (optionally only those watching `productIds`, directly or through their family)
 * on the given channels, each with the best eligible offer right now.
 */
export async function alertCandidates(db: Exec, opts: { productIds?: number[] | null; channels: AlertChannel[] }): Promise<AlertCandidate[]> {
  if (opts.channels.length === 0) return [];
  const ids = opts.productIds && opts.productIds.length > 0 ? opts.productIds : null;
  const filter = ids
    ? sql`AND (al.product_id = ANY(${sql.param(ids)}::bigint[]) OR (al.any_variant AND p.family_id IS NOT NULL
        AND p.family_id IN (SELECT family_id FROM products WHERE id = ANY(${sql.param(ids)}::bigint[]) AND family_id IS NOT NULL)))`
    : sql``;
  const r = await db.execute<{
    id: string; user_id: string; channel: AlertChannel; kind: AlertKind; any_variant: boolean; product_id: string; target: string | null; baseline: string | null;
    armed: boolean; last_at: Date | null; last_at_text: string | null; last_total: string | null; last_offer: string | null;
    offer_id: string | null; offer_product_id: string | null; shop_id: string | null; shop_name: string | null; price: string | null; shipping: string | null;
    shipping_estimated: boolean | null; total: string | null; checked: Date | null; median: string | null;
  }>(sql`
    WITH a AS (
      SELECT al.id, al.user_id, al.channel, al.kind, al.any_variant, al.product_id, al.target_price, al.baseline_total, al.armed,
        al.last_notified_at, al.last_notified_total, al.last_notified_offer_id, p.family_id
      FROM alerts al JOIN products p ON p.id = al.product_id
      WHERE al.status = 'active' AND p.status = 'active' AND al.channel = ANY(${sql.param(opts.channels)}::text[]) ${filter}
    ),
    scope AS (
      SELECT a.id AS alert_id, a.product_id FROM a
      UNION
      SELECT a.id, v.id FROM a JOIN products v ON v.family_id = a.family_id AND v.status = 'active' WHERE a.any_variant AND a.family_id IS NOT NULL
    ),
    best AS (
      SELECT DISTINCT ON (scope.alert_id) scope.alert_id, o.id AS offer_id, o.product_id, o.shop_id, s.name AS shop_name, o.price, o.shipping_cost,
        o.shipping_estimated, o.total_price, o.last_checked_at
      FROM scope JOIN offers o ON o.product_id = scope.product_id JOIN shops s ON s.id = o.shop_id
      WHERE ${ELIGIBLE_ALERT_OFFER}
      ORDER BY scope.alert_id, o.total_price ASC, o.last_checked_at DESC, o.id
    ),
    med AS (
      SELECT o.product_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY o.total_price)::numeric(12,2) AS m
      FROM offers o
      WHERE o.product_id IN (SELECT product_id FROM best) AND o.active AND o.availability = 'in_stock' AND o.match_status IN ('auto','manual')
        AND o.condition = 'new' AND o.last_checked_at > now() - interval '48 hours'
      GROUP BY o.product_id HAVING count(DISTINCT o.shop_id) >= 2
    )
    SELECT a.id::text, a.user_id, a.channel, a.kind, a.any_variant, a.product_id::text, a.target_price::text AS target, a.baseline_total::text AS baseline,
      a.armed, a.last_notified_at AS last_at, a.last_notified_at::text AS last_at_text, a.last_notified_total::text AS last_total,
      a.last_notified_offer_id::text AS last_offer,
      best.offer_id::text, best.product_id::text AS offer_product_id, best.shop_id::text, best.shop_name, best.price::text, best.shipping_cost::text AS shipping,
      best.shipping_estimated, best.total_price::text AS total, best.last_checked_at AS checked, med.m::text AS median
    FROM a LEFT JOIN best ON best.alert_id = a.id LEFT JOIN med ON med.product_id = best.product_id
    ORDER BY a.id
  `);
  return r.rows.map((x) => ({
    alertId: Number(x.id),
    userId: x.user_id,
    channel: x.channel,
    kind: x.kind,
    anyVariant: x.any_variant,
    alertProductId: Number(x.product_id),
    targetBani: bani(x.target),
    baselineBani: bani(x.baseline),
    armed: x.armed,
    lastNotifiedAt: toDate(x.last_at),
    lastNotifiedBani: bani(x.last_total),
    state: { lastNotifiedAt: x.last_at_text, lastNotifiedTotal: x.last_total, lastNotifiedOfferId: x.last_offer ? Number(x.last_offer) : null, armed: x.armed },
    best:
      x.offer_id && x.total && x.price && x.checked
        ? {
            offerId: Number(x.offer_id),
            productId: Number(x.offer_product_id),
            shopId: Number(x.shop_id),
            shopName: x.shop_name ?? '',
            priceBani: bani(x.price)!,
            shippingBani: bani(x.shipping),
            shippingEstimated: x.shipping_estimated ?? false,
            totalBani: bani(x.total)!,
            checkedAt: new Date(x.checked),
            crossShopMedianBani: bani(x.median),
          }
        : null,
  }));
}

const stateMatches = (c: AlertCandidate) => sql`
  status = 'active' AND armed = ${c.state.armed}
  AND last_notified_at IS NOT DISTINCT FROM ${c.state.lastNotifiedAt}::timestamptz
  AND last_notified_total IS NOT DISTINCT FROM ${c.state.lastNotifiedTotal}::numeric
  AND last_notified_offer_id IS NOT DISTINCT FROM ${c.state.lastNotifiedOfferId}::bigint`;

/**
 * Claims one notification: a compare-and-set on the state the decision was made from, and the
 * outbox row, in one transaction. Returns the alert_sends id, or null when another evaluation won.
 */
export async function claimAlertNotification(db: Db, c: AlertCandidate, reason: string, referenceBani: number | null): Promise<number | null> {
  const best = c.best;
  if (!best) return null;
  return db.transaction(async (tx) => {
    const upd = await tx.execute<{ set_at: string }>(sql`
      UPDATE alerts SET last_notified_at = now(), last_notified_total = ${baniToNumeric(best.totalBani)}, last_notified_offer_id = ${best.offerId},
        armed = false, updated_at = now()
      WHERE id = ${c.alertId} AND ${stateMatches(c)}
      RETURNING last_notified_at::text AS set_at`);
    const setAt = upd.rows[0]?.set_at;
    if (!setAt) return null;
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO alert_sends (alert_id, user_id, channel, product_id, offer_id, shop_id, price, shipping_cost, total, reference_total, reason, checked_at, prev_state)
      VALUES (${c.alertId}, ${c.userId}, ${c.channel}, ${best.productId}, ${best.offerId}, ${best.shopId}, ${baniToNumeric(best.priceBani)},
        ${money(best.shippingBani)}, ${baniToNumeric(best.totalBani)}, ${money(referenceBani)}, ${reason}, ${best.checkedAt},
        ${JSON.stringify({ ...c.state, setAt })}::jsonb)
      RETURNING id::text`);
    return Number(ins.rows[0]!.id);
  });
}

/** 'below' alert back above its target: the next crossing is news again. */
export async function rearmAlert(db: Exec, c: AlertCandidate): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`UPDATE alerts SET armed = true, updated_at = now() WHERE id = ${c.alertId} AND ${stateMatches(c)} RETURNING id::text`);
  return r.rows.length > 0;
}

/** 'any_drop' alert confirmed while no offer was eligible: the first eligible total becomes the reference. */
export async function setAlertBaseline(db: Exec, c: AlertCandidate, baselineBani: number): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    UPDATE alerts SET baseline_total = ${baniToNumeric(baselineBani)}, updated_at = now()
    WHERE id = ${c.alertId} AND baseline_total IS NULL AND ${stateMatches(c)} RETURNING id::text`);
  return r.rows.length > 0;
}

/** A clearly marked test message (`pnpm alerts:simulate`): never touches the alert's state. */
export async function queueSimulatedSend(db: Exec, c: AlertCandidate, totalBani: number, referenceBani: number | null): Promise<number> {
  const best = c.best!;
  const ins = await db.execute<{ id: string }>(sql`
    INSERT INTO alert_sends (alert_id, user_id, channel, product_id, offer_id, shop_id, price, shipping_cost, total, reference_total, reason, checked_at, simulated)
    VALUES (${c.alertId}, ${c.userId}, ${c.channel}, ${best.productId}, ${best.offerId}, ${best.shopId},
      ${baniToNumeric(Math.max(1, totalBani - (best.shippingBani ?? 0)))}, ${money(best.shippingBani)}, ${baniToNumeric(totalBani)}, ${money(referenceBani)},
      'simulated', ${best.checkedAt}, true)
    RETURNING id::text`);
  return Number(ins.rows[0]!.id);
}

// ---------------------------------------------------------------------------------------------
// Delivery

export interface QueuedSend {
  id: number;
  alertId: number;
  userId: string;
  email: string;
  channel: AlertChannel;
  productId: number;
  productSlug: string;
  productTitle: string;
  offerId: number;
  shopName: string;
  priceBani: number;
  shippingBani: number | null;
  shippingEstimated: boolean;
  totalBani: number;
  referenceBani: number | null;
  reason: string;
  checkedAt: Date;
  attempts: number;
  simulated: boolean;
  anyVariant: boolean;
  affiliate: boolean;
  /** Before this notification the alert had never notified ('any_drop' compares with the baseline). */
  firstNotification: boolean;
  /** The offer still qualifies and still has the same total (else the message would be stale). */
  stillValid: boolean;
}

/** Puts 'sending' rows older than `minutes` (a crashed delivery) to 'failed', giving the alert its state back. */
export async function recoverStuckSends(db: Db, minutes = 15): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM alert_sends WHERE status = 'sending' AND not_before < now() - make_interval(mins => ${minutes}::int)`);
  const ids = r.rows.map((x) => Number(x.id));
  if (ids.length) await finishSends(db, ids, 'failed', 'interrupted');
  return ids.length;
}

/**
 * Claims up to `limit` queued rows that are due (SKIP LOCKED: concurrent deliveries never share a
 * row) and returns them with what the message needs, re-checked against the offer right now.
 */
export async function claimQueuedSends(db: Exec, opts: { channels: AlertChannel[]; limit?: number }): Promise<QueuedSend[]> {
  if (opts.channels.length === 0) return [];
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE alert_sends SET status = 'sending', attempts = attempts + 1, not_before = now()
    WHERE id IN (
      SELECT id FROM alert_sends WHERE status = 'queued' AND not_before <= now() AND channel = ANY(${sql.param(opts.channels)}::text[])
      ORDER BY id LIMIT ${opts.limit ?? 500} FOR UPDATE SKIP LOCKED)
    RETURNING id::text`);
  const ids = claimed.rows.map((x) => Number(x.id));
  return sendsByIds(db, ids);
}

export async function sendsByIds(db: Exec, ids: number[]): Promise<QueuedSend[]> {
  if (ids.length === 0) return [];
  const r = await db.execute<{
    id: string; alert_id: string; user_id: string; email: string; channel: AlertChannel; product_id: string; slug: string; title: string; offer_id: string;
    shop_name: string | null; price: string; shipping: string | null; shipping_estimated: boolean | null; total: string; reference: string | null; reason: string;
    checked_at: Date; attempts: number; simulated: boolean; any_variant: boolean; affiliate: boolean | null; first: boolean; still_valid: boolean | null;
  }>(sql`
    SELECT snd.id::text, snd.alert_id::text, snd.user_id, u.email, snd.channel, snd.product_id::text, p.slug, p.title, snd.offer_id::text,
      s.name AS shop_name, snd.price::text, snd.shipping_cost::text AS shipping, o.shipping_estimated, snd.total::text, snd.reference_total::text AS reference,
      snd.reason, snd.checked_at, snd.attempts, snd.simulated, a.any_variant, (o.affiliate_url IS NOT NULL) AS affiliate,
      (snd.prev_state->>'lastNotifiedTotal') IS NULL AS first,
      (o.id IS NOT NULL AND o.total_price = snd.total AND ${ELIGIBLE_ALERT_OFFER}) AS still_valid
    FROM alert_sends snd
    JOIN alerts a ON a.id = snd.alert_id
    JOIN users u ON u.id = snd.user_id
    JOIN products p ON p.id = snd.product_id
    LEFT JOIN offers o ON o.id = snd.offer_id
    LEFT JOIN shops s ON s.id = o.shop_id
    WHERE snd.id = ANY(${sql.param(ids)}::bigint[])
    ORDER BY snd.id`);
  return r.rows.map((x) => ({
    id: Number(x.id),
    alertId: Number(x.alert_id),
    userId: x.user_id,
    email: x.email,
    channel: x.channel,
    productId: Number(x.product_id),
    productSlug: x.slug,
    productTitle: x.title,
    offerId: Number(x.offer_id),
    shopName: x.shop_name ?? 'magazin',
    priceBani: bani(x.price)!,
    shippingBani: bani(x.shipping),
    shippingEstimated: x.shipping_estimated ?? false,
    totalBani: bani(x.total)!,
    referenceBani: bani(x.reference),
    reason: x.reason,
    checkedAt: new Date(x.checked_at),
    attempts: x.attempts,
    simulated: x.simulated,
    anyVariant: x.any_variant,
    affiliate: x.affiliate ?? false,
    firstNotification: x.first,
    stillValid: x.simulated ? true : (x.still_valid ?? false),
  }));
}

/**
 * Final or retry status for delivered rows. 'failed' and 'skipped' give the alert its previous
 * state back when nothing else changed it since (a failure never counts as notified).
 */
export async function finishSends(
  db: Db,
  ids: number[],
  status: 'sent' | 'failed' | 'skipped' | 'retry',
  detail: string | null = null,
  opts: { retryMinutes?: number } = {},
): Promise<void> {
  if (ids.length === 0) return;
  const idList = sql`${sql.param(ids)}::bigint[]`;
  if (status === 'sent') {
    await db.execute(sql`UPDATE alert_sends SET status = 'sent', sent_at = now(), provider_message_id = ${detail}, error = NULL WHERE id = ANY(${idList})`);
    return;
  }
  if (status === 'retry') {
    await db.execute(sql`
      UPDATE alert_sends SET status = 'queued', error = ${detail}, not_before = now() + make_interval(mins => ${opts.retryMinutes ?? 15}::int)
      WHERE id = ANY(${idList})`);
    return;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE alert_sends SET status = ${status}, error = ${detail} WHERE id = ANY(${idList})`);
    await tx.execute(sql`
      UPDATE alerts a SET
        last_notified_at = (snd.prev_state->>'lastNotifiedAt')::timestamptz,
        last_notified_total = (snd.prev_state->>'lastNotifiedTotal')::numeric,
        last_notified_offer_id = (snd.prev_state->>'lastNotifiedOfferId')::bigint,
        armed = (snd.prev_state->>'armed')::boolean,
        updated_at = now()
      FROM alert_sends snd
      WHERE snd.id = ANY(${idList}) AND snd.alert_id = a.id AND NOT snd.simulated AND snd.prev_state IS NOT NULL
        AND a.last_notified_at = (snd.prev_state->>'setAt')::timestamptz AND a.last_notified_offer_id = snd.offer_id`);
  });
}

/** Pauses a user's alerts on a channel that stopped working (Telegram blocked, push expired, bounce). */
export async function pauseChannelAlerts(db: Exec, userId: string, channel: AlertChannel, reason: string): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    UPDATE alerts SET status = 'paused', paused_reason = ${reason}, updated_at = now()
    WHERE user_id = ${userId} AND channel = ${channel} AND status = 'active' RETURNING id::text`);
  return r.rows.length;
}

// ---------------------------------------------------------------------------------------------
// Export (GDPR art. 15 and 20) and retention

/** Everything we hold about a user, as one JSON document. */
export async function exportUserData(db: Exec, userId: string, emailHash: string | null): Promise<Record<string, unknown> | null> {
  const u = await db.execute<Record<string, unknown>>(sql`
    SELECT id, email, email_verified, role, created_at, updated_at, last_active_at, retention_notice_at FROM users WHERE id = ${userId}`);
  if (!u.rows[0]) return null;
  const alertsRows = await db.execute<Record<string, unknown>>(sql`
    SELECT a.id, a.product_id, p.title AS product_title, p.slug AS product_slug, a.kind, a.target_price, a.any_variant, a.channel, a.status,
      a.paused_reason, a.consent_at, a.consent_ip_hash, a.consent_text_version, a.confirmed_at, a.confirm_ip_hash, a.confirm_method,
      a.baseline_total, a.last_notified_at, a.last_notified_total, a.created_at, a.updated_at
    FROM alerts a JOIN products p ON p.id = a.product_id WHERE a.user_id = ${userId} ORDER BY a.id`);
  const sends = await db.execute<Record<string, unknown>>(sql`
    SELECT id, alert_id, channel, product_id, offer_id, price, shipping_cost, total, reference_total, reason, checked_at, status, sent_at, simulated, created_at
    FROM alert_sends WHERE user_id = ${userId} ORDER BY id`);
  const consents = await db.execute<Record<string, unknown>>(sql`
    SELECT id, purpose, alert_id, product_id, text_version, given_at, given_ip_hash, confirmed_at, confirm_ip_hash, confirm_method, withdrawn_at, withdraw_method
    FROM consent_records WHERE user_id = ${userId} OR (${emailHash}::text IS NOT NULL AND email_hash = ${emailHash}) ORDER BY id`);
  const sessions = await db.execute<Record<string, unknown>>(sql`SELECT created_at, expires_at FROM sessions WHERE user_id = ${userId} ORDER BY created_at`);
  return {
    user: u.rows[0],
    alerts: alertsRows.rows,
    alertSends: sends.rows,
    consentRecords: consents.rows,
    sessions: sessions.rows,
  };
}

export interface RetentionUser {
  id: string;
  email: string;
  alertCount: number;
}

/** Pending alerts older than `ttlDays` (the double opt-in never happened) are deleted. */
export async function deleteExpiredPendingAlerts(db: Exec, ttlDays: number): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM alerts WHERE status = 'pending' AND created_at < now() - make_interval(days => ${ttlDays}::int) RETURNING id::text`);
  return r.rows.length;
}

/**
 * Accounts without anything left: unverified ones (an address typed into the alert form, never
 * confirmed) after `unverifiedDays`; verified ones without alerts after `inactiveMonths` of
 * inactivity. Only role 'user'.
 */
export async function deleteEmptyAccounts(db: Exec, opts: { unverifiedDays: number; inactiveMonths: number }): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM users u
    WHERE u.role = 'user' AND ${NOTHING_LEFT}
      AND ((NOT u.email_verified AND u.created_at < now() - make_interval(days => ${opts.unverifiedDays}::int))
        OR u.last_active_at < now() - make_interval(months => ${opts.inactiveMonths}::int))
    RETURNING u.id`);
  return r.rows.length;
}

/** Inactive for `months`, with alerts, not yet warned: they get the 30-day notice. */
export async function usersDueRetentionNotice(db: Exec, months: number, limit = 500): Promise<RetentionUser[]> {
  const r = await db.execute<{ id: string; email: string; n: string }>(sql`
    SELECT u.id, u.email, (SELECT count(*) FROM alerts a WHERE a.user_id = u.id)::text AS n
    FROM users u
    WHERE u.role = 'user' AND u.retention_notice_at IS NULL AND u.last_active_at < now() - make_interval(months => ${months}::int)
      AND EXISTS (SELECT 1 FROM alerts a WHERE a.user_id = u.id)
    ORDER BY u.last_active_at LIMIT ${limit}`);
  return r.rows.map((x) => ({ id: x.id, email: x.email, alertCount: Number(x.n) }));
}

export async function markRetentionNotice(db: Exec, userId: string): Promise<void> {
  await db.execute(sql`UPDATE users SET retention_notice_at = now() WHERE id = ${userId}`);
}

/** Warned `graceDays` ago and still inactive since the warning: to be deleted. */
export async function usersDueRetentionDeletion(db: Exec, graceDays: number, limit = 500): Promise<RetentionUser[]> {
  const r = await db.execute<{ id: string; email: string }>(sql`
    SELECT u.id, u.email FROM users u
    WHERE u.role = 'user' AND u.retention_notice_at IS NOT NULL AND u.retention_notice_at < now() - make_interval(days => ${graceDays}::int)
      AND u.last_active_at < u.retention_notice_at
    ORDER BY u.retention_notice_at LIMIT ${limit}`);
  return r.rows.map((x) => ({ id: x.id, email: x.email, alertCount: 0 }));
}

/**
 * Consent evidence after withdrawal: kept `keepYears` (privacy policy: 3 years), then deleted.
 * Requests never confirmed are kept `unconfirmedDays` (proof of what was asked, nothing more).
 */
export async function pruneConsentRecords(db: Exec, opts: { keepYears: number; unconfirmedDays: number }): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM consent_records c
    WHERE (c.withdrawn_at IS NOT NULL AND c.withdrawn_at < now() - make_interval(years => ${opts.keepYears}::int))
      OR (c.confirmed_at IS NULL AND c.given_at < now() - make_interval(days => ${opts.unconfirmedDays}::int)
          AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.id = c.alert_id))
    RETURNING c.id::text`);
  return r.rows.length;
}

/** Old outbox rows (13 months), finished ones only. */
export async function pruneAlertSends(db: Exec, months = 13): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM alert_sends WHERE status IN ('sent','failed','skipped') AND created_at < now() - make_interval(months => ${months}::int) RETURNING id::text`);
  return r.rows.length;
}

/** Alerts on merged products follow the merge (a duplicate for the same user and channel is dropped). */
export async function repointMergedAlerts(db: Db): Promise<number> {
  let moved = 0;
  for (let hop = 0; hop < 5; hop++) {
    const n = await db.transaction(async (tx) => {
      const dup = sql`a.id IN (
        SELECT a.id FROM alerts a JOIN products p ON p.id = a.product_id
        WHERE p.status = 'merged' AND p.merged_into_id IS NOT NULL AND a.status <> 'pending'
          AND EXISTS (SELECT 1 FROM alerts b WHERE b.user_id = a.user_id AND b.product_id = p.merged_into_id AND b.channel = a.channel AND b.status <> 'pending'))`;
      await tx.execute(sql`UPDATE consent_records SET withdrawn_at = now(), withdraw_method = 'replaced' WHERE withdrawn_at IS NULL AND alert_id IN (SELECT a.id FROM alerts a WHERE ${dup})`);
      await tx.execute(sql`DELETE FROM alerts a WHERE ${dup}`);
      const r = await tx.execute<{ id: string }>(sql`
        UPDATE alerts a SET product_id = p.merged_into_id, updated_at = now()
        FROM products p WHERE p.id = a.product_id AND p.status = 'merged' AND p.merged_into_id IS NOT NULL
        RETURNING a.id::text`);
      return r.rows.length;
    });
    moved += n;
    if (n === 0) break;
  }
  return moved;
}

/**
 * Clicks and analytics events (privacy policy: at most 13 months; after 90 days only totals):
 * identifiers are dropped after 90 days and rows deleted after 13 months.
 */
export async function minimizeClicksAndEvents(db: Exec): Promise<{ anonymized: number; deleted: number }> {
  const a1 = await db.execute(sql`
    UPDATE clicks SET ua_hash = NULL, ip_hash = NULL, session_hash = NULL
    WHERE ts < now() - interval '90 days' AND (ua_hash IS NOT NULL OR ip_hash IS NOT NULL OR session_hash IS NOT NULL)`);
  const a2 = await db.execute(sql`UPDATE events SET session_hash = NULL WHERE ts < now() - interval '90 days' AND session_hash IS NOT NULL`);
  const d1 = await db.execute(sql`DELETE FROM clicks WHERE ts < now() - interval '13 months'`);
  const d2 = await db.execute(sql`DELETE FROM events WHERE ts < now() - interval '13 months'`);
  return { anonymized: (a1.rowCount ?? 0) + (a2.rowCount ?? 0), deleted: (d1.rowCount ?? 0) + (d2.rowCount ?? 0) };
}

// ---------------------------------------------------------------------------------------------
// Admin

export interface AlertAdminStats {
  byStatus: Array<{ status: string; channel: string; n: number }>;
  confirmed7d: number;
  pendingOlder24h: number;
  sends: Array<{ status: string; channel: string; d1: number; d7: number }>;
  withdrawals30d: Array<{ method: string; n: number }>;
  suppressions: Array<{ reason: string; n: number }>;
  topProducts: Array<{ productId: number; title: string; slug: string; n: number }>;
  recentFailures: Array<{ id: number; channel: string; error: string | null; at: Date }>;
  users: number;
}

export async function alertAdminStats(db: Exec): Promise<AlertAdminStats> {
  const [byStatus, confirmed, pending, sends, withdrawals, suppressions, top, failures, users] = await Promise.all([
    db.execute<{ status: string; channel: string; n: string }>(sql`SELECT status, channel, count(*)::text AS n FROM alerts GROUP BY 1, 2 ORDER BY 1, 2`),
    db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM alerts WHERE confirmed_at > now() - interval '7 days'`),
    db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM alerts WHERE status = 'pending' AND created_at < now() - interval '24 hours'`),
    db.execute<{ status: string; channel: string; d1: string; d7: string }>(sql`
      SELECT status, channel, count(*) FILTER (WHERE created_at > now() - interval '24 hours')::text AS d1, count(*)::text AS d7
      FROM alert_sends WHERE created_at > now() - interval '7 days' AND NOT simulated GROUP BY 1, 2 ORDER BY 1, 2`),
    db.execute<{ method: string; n: string }>(sql`
      SELECT coalesce(withdraw_method, '?') AS method, count(*)::text AS n FROM consent_records
      WHERE withdrawn_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
    db.execute<{ reason: string; n: string }>(sql`SELECT reason, count(*)::text AS n FROM email_suppressions GROUP BY 1 ORDER BY 1`),
    db.execute<{ id: string; title: string; slug: string; n: string }>(sql`
      SELECT p.id::text, p.title, p.slug, count(*)::text AS n FROM alerts a JOIN products p ON p.id = a.product_id
      WHERE a.status = 'active' GROUP BY p.id ORDER BY count(*) DESC, p.id LIMIT 15`),
    db.execute<{ id: string; channel: string; error: string | null; at: Date }>(sql`
      SELECT id::text, channel, error, created_at AS at FROM alert_sends WHERE status = 'failed' ORDER BY id DESC LIMIT 10`),
    db.execute<{ n: string }>(sql`SELECT count(DISTINCT user_id)::text AS n FROM alerts`),
  ]);
  return {
    byStatus: byStatus.rows.map((x) => ({ status: x.status, channel: x.channel, n: Number(x.n) })),
    confirmed7d: Number(confirmed.rows[0]?.n ?? 0),
    pendingOlder24h: Number(pending.rows[0]?.n ?? 0),
    sends: sends.rows.map((x) => ({ status: x.status, channel: x.channel, d1: Number(x.d1), d7: Number(x.d7) })),
    withdrawals30d: withdrawals.rows.map((x) => ({ method: x.method, n: Number(x.n) })),
    suppressions: suppressions.rows.map((x) => ({ reason: x.reason, n: Number(x.n) })),
    topProducts: top.rows.map((x) => ({ productId: Number(x.id), title: x.title, slug: x.slug, n: Number(x.n) })),
    recentFailures: failures.rows.map((x) => ({ id: Number(x.id), channel: x.channel, error: x.error, at: toDateNN(x.at) })),
    users: Number(users.rows[0]?.n ?? 0),
  };
}

/** A user by address (admin data-subject requests). */
export async function findUserByEmail(db: Exec, email: string): Promise<{ id: string; email: string; role: string; createdAt: Date; alerts: number } | null> {
  const r = await db.execute<{ id: string; email: string; role: string; created_at: Date; n: string }>(sql`
    SELECT u.id, u.email, u.role, u.created_at, (SELECT count(*) FROM alerts a WHERE a.user_id = u.id)::text AS n
    FROM users u WHERE lower(u.email) = lower(${email.trim()})`);
  const x = r.rows[0];
  return x ? { id: x.id, email: x.email, role: x.role, createdAt: toDateNN(x.created_at), alerts: Number(x.n) } : null;
}
