import 'server-only';
import { randomBytes } from 'node:crypto';
import { emailProvesDomain } from '@pretoscop/core';
import {
  eq,
  isFlagEnabled,
  MERCHANT_DAILY_LIMITS,
  MERCHANT_FRESHNESS_HOURS,
  MERCHANT_JOBS,
  merchantActionsLastDay,
  merchants,
  sql,
  users,
} from '@pretoscop/db';
import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { db } from './db';
import { boss } from './jobs';

/** The portal pages live under /pentru-magazine/cont; the login page sends the magic link back there. */
export const PORTAL_PATH = '/pentru-magazine/cont';
export const PORTAL_LOGIN_PATH = '/pentru-magazine/autentificare';

export type Merchant = typeof merchants.$inferSelect;

/** Signed-in user or a redirect to the merchant login page. */
export async function requirePortalUser(): Promise<{ id: string; email: string; role: string }> {
  const s = await getSession();
  const email = s?.user.email?.toLowerCase();
  if (!s || !email) redirect(PORTAL_LOGIN_PATH);
  return { id: s.user.id, email, role: (s.user as { role?: string }).role ?? 'user' };
}

export async function merchantOf(userId: string): Promise<Merchant | null> {
  const [m] = await db().select().from(merchants).where(eq(merchants.userId, userId));
  return m ?? null;
}

export function portalOpen(): Promise<boolean> {
  return isFlagEnabled(db(), 'merchants.portal.enabled');
}

/** Creates the user's (draft) merchant profile and gives the account the `merchant` role (admins keep theirs). */
export async function ensureMerchant(user: { id: string; email: string; role: string }): Promise<Merchant> {
  const existing = await merchantOf(user.id);
  if (existing) return existing;
  const [created] = await db()
    .insert(merchants)
    .values({ userId: user.id, contactEmail: user.email, verificationToken: randomBytes(16).toString('hex') })
    .onConflictDoNothing({ target: merchants.userId })
    .returning();
  if (user.role === 'user') await db().update(users).set({ role: 'merchant', updatedAt: new Date() }).where(eq(users.id, user.id));
  return created ?? (await merchantOf(user.id))!;
}

/** Whether the signed-in email address alone proves control of the domain (same domain, not webmail). */
export function emailVerifies(email: string, domain: string | null): boolean {
  return Boolean(domain) && emailProvesDomain(email, domain!);
}

/**
 * Seconds a merchant must wait between two checks of the same kind, whatever address it gives
 * (our bot is not a fetch proxy); uploads count as feed checks.
 */
export const CHECK_COOLDOWN_SECONDS = { validate: 30, verifyDomain: 20, upload: 60 } as const;

export function secondsSince(iso: string | Date | undefined | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - (iso instanceof Date ? iso.getTime() : Date.parse(iso))) / 1000;
}

/** Whether the merchant used up a daily allowance of the portal (rolling 24 h, audit_log). */
export async function overDailyLimit(merchantId: number, kind: keyof typeof MERCHANT_DAILY_LIMITS): Promise<boolean> {
  const { actions, limit } = MERCHANT_DAILY_LIMITS[kind];
  return (await merchantActionsLastDay(db(), merchantId, actions)) >= limit;
}

/**
 * Queues a worker check. The queues are pg-boss `stately`: with the merchant id as singleton key,
 * one check per merchant waits and one runs; the waiting one reads the latest state when it starts.
 */
export async function enqueueCheck(kind: keyof typeof MERCHANT_JOBS, merchantId: number): Promise<void> {
  const now = new Date().toISOString();
  if (kind === 'validate') {
    await db().update(merchants).set({ validation: { status: 'queued', requestedAt: now } }).where(eq(merchants.id, merchantId));
  } else {
    await db().update(merchants).set({ domainCheck: { status: 'queued', requestedAt: now } }).where(eq(merchants.id, merchantId));
  }
  const b = await boss();
  await b.send(MERCHANT_JOBS[kind], { merchantId }, { singletonKey: String(merchantId), retryLimit: 0, expireInSeconds: 600 });
}

/** Queues one run of a source now (same job as the admin's "Rulează acum"). */
export async function runSourceNow(sourceId: number, key: string, shopSlug: string): Promise<void> {
  const b = await boss();
  await b.send('source.run', { sourceId, trigger: 'manual' }, { singletonKey: key, group: { id: shopSlug } });
}

/**
 * Freshness of a merchant's offers as buyers see it: an uploaded file is read once, so its offers
 * get three days before they turn grey; a feed address is read every four hours (12 h). Applies to
 * the shop the portal created for the merchant (a registry shop keeps the SLO of its YAML) and to
 * the merchant's source.
 */
export async function setMerchantFeedFreshness(m: Pick<Merchant, 'id' | 'shopId'>, mode: keyof typeof MERCHANT_FRESHNESS_HOURS): Promise<void> {
  const hours = MERCHANT_FRESHNESS_HOURS[mode];
  await db().execute(sql`
    UPDATE shop_sources SET freshness_slo_hours = ${hours}, updated_at = now()
    WHERE config->>'origin' = 'merchant' AND (config->>'merchantId')::bigint = ${m.id}`);
  if (m.shopId) {
    await db().execute(sql`
      UPDATE shops SET crawl_policy = jsonb_set(crawl_policy, '{freshness_slo_hours}', to_jsonb(${hours}::int))
      WHERE id = ${m.shopId} AND legal_basis_ref = ${`merchant:${m.id}`}`);
  }
}

/** Hours after which the offers of an uploaded file turn grey on product pages, for this merchant. */
export async function uploadFreshnessHours(m: Pick<Merchant, 'id' | 'shopId'> | null): Promise<number> {
  if (!m?.shopId) return MERCHANT_FRESHNESS_HOURS.upload;
  const [shop] = (
    await db().execute<{ slo: number | null; own: boolean }>(sql`
      SELECT (crawl_policy->>'freshness_slo_hours')::int AS slo, legal_basis_ref = ${`merchant:${m.id}`} AS own FROM shops WHERE id = ${m.shopId}`)
  ).rows;
  if (!shop || shop.own) return MERCHANT_FRESHNESS_HOURS.upload;
  return shop.slo ?? 26;
}

/** The live numbers of an approved merchant's dashboard. Freshness uses the shop's SLO, like product pages. */
export async function merchantDashboard(m: Merchant) {
  if (!m.shopId) return null;
  const d = db();
  const [totals] = (
    await d.execute<{
      active: string;
      matched: string;
      with_gtin: string;
      stale: string;
      shipping_unknown: string;
      clicks30: string;
      slo: number;
    }>(sql`
      SELECT
        count(o.id) FILTER (WHERE o.active)::text AS active,
        count(o.id) FILTER (WHERE o.active AND o.product_id IS NOT NULL)::text AS matched,
        count(o.id) FILTER (WHERE o.active AND o.gtin14 IS NOT NULL)::text AS with_gtin,
        count(o.id) FILTER (WHERE o.active AND o.last_checked_at < now() - make_interval(hours => coalesce((p.crawl_policy->>'freshness_slo_hours')::int, 26)))::text AS stale,
        count(o.id) FILTER (WHERE o.active AND o.shipping_cost IS NULL AND o.total_price = o.price)::text AS shipping_unknown,
        (SELECT count(*) FROM clicks c WHERE c.shop_id = ${m.shopId} AND c.ts > now() - interval '30 days')::text AS clicks30,
        coalesce((p.crawl_policy->>'freshness_slo_hours')::int, 26) AS slo
      FROM shops p
      JOIN shop_sources s ON s.shop_id = p.id AND s.config->>'origin' = 'merchant' AND (s.config->>'merchantId')::bigint = ${m.id}
      LEFT JOIN offers o ON o.source_id = s.id
      WHERE p.id = ${m.shopId}
      GROUP BY p.crawl_policy`)
  ).rows;
  const [source] = (
    await d.execute<{ id: string; key: string; enabled: boolean; health: string; last_success_at: string | null; schedule: string | null; url: string; slug: string }>(sql`
      SELECT s.id::text, s.key, s.enabled, s.health, s.last_success_at::text, s.schedule, s.url, p.slug
      FROM shop_sources s JOIN shops p ON p.id = s.shop_id
      WHERE s.config->>'origin' = 'merchant' AND (s.config->>'merchantId')::bigint = ${m.id}
      ORDER BY s.id LIMIT 1`)
  ).rows;
  const runs = source
    ? (
        await d.execute<{ started_at: string; status: string; stats: Record<string, number>; error_sample: string | null }>(sql`
          SELECT started_at::text, status, stats, error_sample FROM ingest_runs WHERE source_id = ${Number(source.id)} ORDER BY id DESC LIMIT 5`)
      ).rows
    : [];
  const top = (
    await d.execute<{ product_id: string; title: string; slug: string; clicks: string }>(sql`
      SELECT p.id::text AS product_id, p.title, p.slug, count(*)::text AS clicks
      FROM clicks c JOIN products p ON p.id = c.product_id
      WHERE c.shop_id = ${m.shopId} AND c.ts > now() - interval '30 days'
      GROUP BY p.id, p.title, p.slug ORDER BY count(*) DESC LIMIT 10`)
  ).rows;
  const num = (v: string | undefined) => Number(v ?? 0);
  return {
    activeOffers: num(totals?.active),
    matched: num(totals?.matched),
    withGtin: num(totals?.with_gtin),
    stale: num(totals?.stale),
    shippingUnknown: num(totals?.shipping_unknown),
    clicks30: num(totals?.clicks30),
    freshnessHours: totals?.slo ?? MERCHANT_FRESHNESS_HOURS.url,
    source: source ? { ...source, id: Number(source.id) } : null,
    runs,
    top,
  };
}
