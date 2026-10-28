import 'server-only';
import { randomBytes } from 'node:crypto';
import { emailProvesDomain } from '@pretoscop/core';
import { eq, isFlagEnabled, MERCHANT_JOBS, merchants, sql, users } from '@pretoscop/db';
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

/** Seconds a merchant must wait between two checks of the same kind (our bot is not a fetch proxy). */
export const CHECK_COOLDOWN_SECONDS = { validate: 30, verifyDomain: 20 } as const;

export function secondsSince(iso: string | undefined | null): number {
  return iso ? (Date.now() - Date.parse(iso)) / 1000 : Number.POSITIVE_INFINITY;
}

/** Queues a worker check; one pending job per merchant and kind. */
export async function enqueueCheck(kind: keyof typeof MERCHANT_JOBS, merchantId: number): Promise<void> {
  const now = new Date().toISOString();
  if (kind === 'validate') {
    await db().update(merchants).set({ validation: { status: 'queued', requestedAt: now } }).where(eq(merchants.id, merchantId));
  } else {
    await db().update(merchants).set({ domainCheck: { status: 'queued', requestedAt: now } }).where(eq(merchants.id, merchantId));
  }
  const b = await boss();
  await b.send(MERCHANT_JOBS[kind], { merchantId }, { singletonKey: `${MERCHANT_JOBS[kind]}:${merchantId}`, retryLimit: 0, expireInSeconds: 600 });
}

/** Queues one run of a source now (same job as the admin's "Rulează acum"). */
export async function runSourceNow(sourceId: number, key: string, shopSlug: string): Promise<void> {
  const b = await boss();
  await b.send('source.run', { sourceId, trigger: 'manual' }, { singletonKey: key, group: { id: shopSlug } });
}

/** The live numbers of an approved merchant's dashboard. */
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
    }>(sql`
      SELECT
        count(*) FILTER (WHERE o.active)::text AS active,
        count(*) FILTER (WHERE o.active AND o.product_id IS NOT NULL)::text AS matched,
        count(*) FILTER (WHERE o.active AND o.gtin14 IS NOT NULL)::text AS with_gtin,
        count(*) FILTER (WHERE o.active AND o.last_checked_at < now() - make_interval(hours => s.freshness_slo_hours))::text AS stale,
        count(*) FILTER (WHERE o.active AND o.shipping_cost IS NULL AND o.total_price = o.price)::text AS shipping_unknown,
        (SELECT count(*) FROM clicks c WHERE c.shop_id = ${m.shopId} AND c.ts > now() - interval '30 days')::text AS clicks30
      FROM shop_sources s
      LEFT JOIN offers o ON o.source_id = s.id
      WHERE s.shop_id = ${m.shopId} AND s.config->>'origin' = 'merchant'
      GROUP BY s.freshness_slo_hours`)
  ).rows;
  const [source] = (
    await d.execute<{ id: string; key: string; enabled: boolean; health: string; last_success_at: string | null; schedule: string | null; url: string; slug: string }>(sql`
      SELECT s.id::text, s.key, s.enabled, s.health, s.last_success_at::text, s.schedule, s.url, p.slug
      FROM shop_sources s JOIN shops p ON p.id = s.shop_id
      WHERE s.shop_id = ${m.shopId} AND s.config->>'origin' = 'merchant'
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
    source: source ? { ...source, id: Number(source.id) } : null,
    runs,
    top,
  };
}
