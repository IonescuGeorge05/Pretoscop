import { hostOnShopDomain, shopSlugFromDomain } from '@pretoscop/core';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import {
  merchants,
  type MerchantDomainCheck,
  type MerchantFeedFormat,
  type MerchantFeedTarget,
  type MerchantShippingRules,
  type MerchantValidation,
} from '../schema/merchants';
import { shopSources, shops } from '../schema/shops';
import { auditLog } from '../schema/system';

/**
 * Merchant portal lifecycle (M20). Approval turns a verified, validated merchant into a shop (new or
 * existing) plus one feed source on the normal ingestion path (M05): `kind='feed'`, source tier 1,
 * pulled six times a day, owned by the portal (`config.origin='merchant'`, so `shops:sync` never
 * disables it). Every transition writes an `audit_log` row; rejections and suspensions keep their
 * statement of reasons (P2B Regulation art. 4) and hide the merchant's offers at once.
 */

type Merchant = typeof merchants.$inferSelect;

/**
 * pg-boss job names shared by the web app (producer) and the worker. Their queues use the
 * `stately` policy, so `singletonKey` (one per merchant) allows one queued and one running check.
 * (The first names, `merchant.validate` / `merchant.verify_domain`, were standard queues where pg-boss
 * ignores the key; a queue's policy cannot change after creation, hence the new names.)
 */
export const MERCHANT_JOBS = { validate: 'merchant.feed_check', verifyDomain: 'merchant.domain_check' } as const;

/** Same keys as `FEED_PARSER_FOR_FORMAT` in @pretoscop/extractors (a worker test keeps them equal). */
export const MERCHANT_FEED_PARSERS: Record<MerchantFeedFormat, string> = {
  google: 'feed-google-shopping',
  compari: 'feed-compari-xml',
  csv: 'feed-csv-generic',
};

/** `shop_sources.url` prefix of an uploaded feed file (read by the recorder from the blob store). */
export const MERCHANT_UPLOAD_PREFIX = 'upload:';

/**
 * Hours after which an offer of a merchant feed is shown as not recently confirmed. A feed address
 * is read every 4 hours; an uploaded file only once, so its offers get three days. Portal-created
 * shops carry the value in `crawl_policy.freshness_slo_hours` (what product pages use).
 */
export const MERCHANT_FRESHNESS_HOURS = { url: 12, upload: 72 } as const;

/** Merchant-initiated actions counted per rolling 24 h (audit_log), and their caps. */
export const MERCHANT_DAILY_LIMITS = {
  /** Feed checks: new address, re-check, settings that re-check, uploads. */
  feedChecks: { actions: ['merchant.feed_url', 'merchant.feed_recheck', 'merchant.feed_upload', 'merchant.settings'], limit: 30 },
  uploads: { actions: ['merchant.feed_upload'], limit: 10 },
  domainChecks: { actions: ['merchant.domain_check'], limit: 30 },
} as const;

export function merchantSourceKey(shopSlug: string): string {
  return `${shopSlug}:feed:merchant`;
}

/** Six pulls a day (every four hours); the minute is staggered by merchant id. */
export function merchantFeedSchedule(merchantId: number): string {
  return `${merchantId % 60} */4 * * *`;
}

export class MerchantActionError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'bad_status'
      | 'domain_unverified'
      | 'no_feed'
      | 'incomplete'
      | 'shop_closed'
      | 'domain_taken'
      | 'domain_suspended'
      | 'stale_report'
      | 'confirm_existing',
    message: string,
  ) {
    super(message);
    this.name = 'MerchantActionError';
  }
}

export interface ApproveResult {
  shopId: number;
  shopSlug: string;
  shopCreated: boolean;
  sourceId: number;
  sourceKey: string;
}

/** The feed and domain a check made now would be about. */
export function feedTargetOf(m: { feedUrl?: string | null; feedUploadKey?: string | null; domain?: string | null }): MerchantFeedTarget {
  return { feedUrl: m.feedUrl ?? null, feedUploadKey: m.feedUrl ? null : (m.feedUploadKey ?? null), domain: m.domain ?? null };
}

export function sameFeedTarget(a: MerchantFeedTarget | undefined, b: MerchantFeedTarget): boolean {
  return Boolean(a) && a!.feedUrl === b.feedUrl && a!.feedUploadKey === b.feedUploadKey && a!.domain === b.domain;
}

export type ListingReportProblem = 'not_checked' | 'stale' | 'failed' | 'off_domain_only' | 'nothing_listable' | 'price_format';

/**
 * Why the last feed check cannot support a submission or an approval (null: it can). The check
 * must be finished, be about the current feed address or file AND the current shop domain, find
 * at least one listable offer on that domain, and the price format must be settled.
 */
export function listingReportProblem(m: Pick<Merchant, 'feedUrl' | 'feedUploadKey' | 'domain' | 'validation' | 'priceFormat'>): ListingReportProblem | null {
  const v = m.validation;
  if (!v || v.status === 'queued' || v.status === 'running') return 'not_checked';
  if (!sameFeedTarget(v.target, feedTargetOf(m))) return 'stale';
  const r = v.report;
  if (v.status !== 'done' || !r) return 'failed';
  if (!m.domain || r.domain.expected !== m.domain || r.domain.onDomain === 0) return 'off_domain_only';
  if (r.normalization.accepted === 0) return 'nothing_listable';
  if (r.priceFormat.needsChoice && !m.priceFormat) return 'price_format';
  return null;
}

/**
 * Stores a feed check result only if nobody asked for a newer check meanwhile and the merchant's
 * feed and domain are still the ones that were checked (a result for an old address is dropped).
 * Returns whether it was stored.
 */
export async function saveMerchantValidation(
  db: Db,
  merchantId: number,
  validation: MerchantValidation & { target: MerchantFeedTarget },
  detectedFormat?: MerchantFeedFormat,
): Promise<boolean> {
  const t = validation.target;
  const res = await db.execute(sql`
    UPDATE merchants SET validation = ${JSON.stringify(validation)}::jsonb,
      ${detectedFormat ? sql`feed_format = coalesce(feed_format, ${detectedFormat}),` : sql``}
      updated_at = now()
    WHERE id = ${merchantId}
      AND feed_url IS NOT DISTINCT FROM ${t.feedUrl}
      AND (feed_url IS NOT NULL OR feed_upload_key IS NOT DISTINCT FROM ${t.feedUploadKey})
      AND domain IS NOT DISTINCT FROM ${t.domain}
      AND (validation IS NULL OR validation->>'requestedAt' = ${validation.requestedAt})`);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Stores a domain check for the domain that was checked, and marks that domain verified when the
 * check found the token, but only while the merchant still claims that very domain: a merchant who
 * switches to someone else's domain while a check of their own runs gets nothing verified.
 */
export async function saveMerchantDomainCheck(
  db: Db,
  merchantId: number,
  check: MerchantDomainCheck & { domain: string },
  method: 'dns' | 'file' | null,
  at: Date = new Date(),
): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE merchants SET domain_check = ${JSON.stringify(check)}::jsonb,
      ${
        method
          ? sql`verification_method = CASE WHEN domain_verified_at IS NULL THEN ${method} ELSE verification_method END,
                domain_verified_at = coalesce(domain_verified_at, ${at}),`
          : sql``
      }
      updated_at = now()
    WHERE id = ${merchantId} AND domain = ${check.domain}`);
  return (res.rowCount ?? 0) > 0;
}

/** Merchant-initiated actions of one kind in the last 24 hours (rate limits of the portal). */
export async function merchantActionsLastDay(db: Db, merchantId: number, actions: readonly string[]): Promise<number> {
  const res = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n FROM audit_log
    WHERE entity = 'merchants' AND entity_id = ${String(merchantId)} AND actor LIKE 'merchant:%'
      AND action IN (${sql.join(
        actions.map((a) => sql`${a}`),
        sql`, `,
      )})
      AND ts > now() - interval '24 hours'`);
  return Number(res.rows[0]?.n ?? 0);
}

export interface RegisteredShop {
  id: number;
  slug: string;
  name: string;
  domain: string;
  status: string;
  accessMode: string;
  legalBasisRef: string | null;
}

/** Registered shops whose domain covers `host` (the shop itself or a subdomain of it). */
export async function shopsCoveringHost(db: Db, host: string): Promise<RegisteredShop[]> {
  const h = host.toLowerCase().replace(/\.$/, '');
  const rows = await db
    .select({ id: shops.id, slug: shops.slug, name: shops.name, domain: shops.domain, status: shops.status, accessMode: shops.accessMode, legalBasisRef: shops.legalBasisRef })
    .from(shops)
    .where(sql`${h} = ${shops.domain} OR ${h} LIKE '%.' || ${shops.domain}`);
  return rows.filter((s) => hostOnShopDomain(h, s.domain));
}

/**
 * A registered shop (other than the merchant's own) that `host` belongs to, or null. Requests the
 * portal makes for a merchant (feed checks, verification files, merchant feed pulls) never go to
 * such a host: a stranger must not steer our bot at the shops we crawl. The merchant's own domain
 * counts as its own only once verified; the shop the portal created for it always does.
 */
export async function foreignShopForHost(
  db: Db,
  host: string,
  own: { merchantId: number; domain: string | null; domainVerified: boolean },
): Promise<RegisteredShop | null> {
  if (own.domain && own.domainVerified && hostOnShopDomain(host, own.domain)) return null;
  const covering = await shopsCoveringHost(db, host);
  return covering.find((s) => s.legalBasisRef !== `merchant:${own.merchantId}`) ?? null;
}

/** The registered shop an approval would attach the merchant's feed to, with its sources (admin warning). */
export async function existingShopForMerchantDomain(db: Db, domain: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.domain, domain));
  if (!shop) return null;
  const sources = await db
    .select({ key: shopSources.key, kind: shopSources.kind, enabled: shopSources.enabled, killSwitch: shopSources.killSwitch, config: shopSources.config })
    .from(shopSources)
    .where(eq(shopSources.shopId, shop.id))
    .orderBy(shopSources.key);
  return { shop, sources };
}

function hasRules(r: MerchantShippingRules): boolean {
  return [r.free_over, r.flat, r.locker_flat].some((v) => typeof v === 'number');
}

async function uniqueSlug(tx: Pick<Db, 'select'>, base: string): Promise<string> {
  const taken = new Set((await tx.select({ slug: shops.slug }).from(shops)).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * pending → approved. Creates the shop when no shop has the merchant's domain. Attaching the feed
 * to an existing shop (one we already crawl) needs `confirmShopId` equal to that shop's id: the
 * admin saw the warning and its sources. That shop must be active with access_mode other than off
 * (registry shops change through their YAML).
 */
export async function approveMerchant(db: Db, merchantId: number, actor: string, opts: { confirmShopId?: number } = {}): Promise<ApproveResult> {
  try {
    return await db.transaction(async (tx) => {
      const [m] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for('update');
      if (!m) throw new MerchantActionError('not_found', `merchant ${merchantId} not found`);
      if (m.status !== 'pending') throw new MerchantActionError('bad_status', `merchant ${merchantId} is ${m.status}, not pending`);
      if (!m.domain || !m.domainVerifiedAt) throw new MerchantActionError('domain_unverified', 'the shop domain is not verified');
      if (!m.feedFormat || (!m.feedUrl && !m.feedUploadKey)) throw new MerchantActionError('no_feed', 'no feed address or file');
      if (!m.shopName) throw new MerchantActionError('incomplete', 'the shop name is missing');
      const problem = listingReportProblem(m);
      if (problem) throw new MerchantActionError('stale_report', `the last feed check does not support approval (${problem}): check the feed again`);
      const [suspended] = await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(sql`${merchants.domain} = ${m.domain} AND ${merchants.status} = 'suspended' AND ${merchants.id} <> ${m.id}`);
      if (suspended) throw new MerchantActionError('domain_suspended', `merchant #${suspended.id} with the same domain is suspended`);

      const [existing] = await tx.select().from(shops).where(eq(shops.domain, m.domain));
      const upload = !m.feedUrl;
      let shopId: number;
      let shopSlug: string;
      let shopCreated = false;
      if (existing) {
        if (existing.status !== 'active' || existing.accessMode === 'off') {
          throw new MerchantActionError(
            'shop_closed',
            `shop ${existing.slug} is ${existing.status}/${existing.accessMode}: set status: active and access_mode: feed_only in packages/config/shops/${existing.slug}.yaml and run shops:sync before approving`,
          );
        }
        if (opts.confirmShopId !== existing.id) {
          throw new MerchantActionError('confirm_existing', `the domain belongs to the existing shop ${existing.slug}: confirm attaching the feed to it`);
        }
        shopId = existing.id;
        shopSlug = existing.slug;
      } else {
        shopSlug = await uniqueSlug(tx, shopSlugFromDomain(m.domain));
        const [row] = await tx
          .insert(shops)
          .values({
            slug: shopSlug,
            name: m.shopName,
            domain: m.domain,
            websiteUrl: m.websiteUrl ?? `https://${m.domain}`,
            kind: 'retail',
            status: 'active',
            accessMode: 'feed_only',
            trustTier: 2,
            shippingRules: m.shippingRules ?? {},
            shippingVerified: hasRules(m.shippingRules ?? {}),
            crawlPolicy: { min_interval_ms: 5000, freshness_slo_hours: upload ? MERCHANT_FRESHNESS_HOURS.upload : MERCHANT_FRESHNESS_HOURS.url },
            vatIncludedDefault: true,
            legalBasisRef: `merchant:${m.id}`,
            legalNotes: `Listed through the merchant portal; ${m.termsVersion ?? 'terms'} accepted ${m.termsAcceptedAt?.toISOString() ?? '?'}`,
          })
          .returning({ id: shops.id });
        shopId = row!.id;
        shopCreated = true;
      }

      const sourceKey = merchantSourceKey(shopSlug);
      const desired = {
        shopId,
        key: sourceKey,
        kind: 'feed' as const,
        url: upload ? `${MERCHANT_UPLOAD_PREFIX}${m.feedUploadKey}` : m.feedUrl!,
        format: m.feedFormat,
        parserKey: MERCHANT_FEED_PARSERS[m.feedFormat],
        schedule: upload ? null : merchantFeedSchedule(m.id),
        config: {
          origin: 'merchant',
          merchantId: m.id,
          priceFormat: m.priceFormat ?? null,
          requireDomain: m.domain,
          ...(upload && m.feedUploadedAt ? { uploadedAt: m.feedUploadedAt.toISOString() } : {}),
        },
        enabled: true,
        // Uploaded files are not re-read: their offers go stale after three days unless re-uploaded.
        freshnessSloHours: upload ? MERCHANT_FRESHNESS_HOURS.upload : MERCHANT_FRESHNESS_HOURS.url,
        sourceTier: 1,
        nextRunAt: null,
      };
      // The kill switch stays as the admins left it (a runtime switch, never reset by approval).
      const [src] = await tx
        .insert(shopSources)
        .values(desired)
        .onConflictDoUpdate({ target: shopSources.key, set: { ...desired, updatedAt: sql`now()` } })
        .returning({ id: shopSources.id });

      await tx
        .update(merchants)
        .set({ status: 'approved', shopId, decidedAt: new Date(), decidedBy: actor, statusReason: null })
        .where(eq(merchants.id, m.id));
      await tx.insert(auditLog).values({
        actor,
        action: 'merchant.approve',
        entity: 'merchants',
        entityId: String(m.id),
        before: { status: m.status },
        after: { status: 'approved', shopId, shopSlug, shopCreated, sourceKey },
      });
      return { shopId, shopSlug, shopCreated, sourceId: src!.id, sourceKey };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new MerchantActionError('domain_taken', 'another merchant already lists this domain');
    throw err;
  }
}

export interface TransitionResult {
  shopId: number | null;
  /** Matched products whose offers were hidden (their pages and stats need a refresh). */
  productIds: number[];
}

async function transition(
  db: Db,
  merchantId: number,
  actor: string,
  from: string[],
  to: 'rejected' | 'suspended' | 'approved',
  reason: string | null,
): Promise<TransitionResult> {
  try {
    return await db.transaction(async (tx) => {
      const [m] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for('update');
      if (!m) throw new MerchantActionError('not_found', `merchant ${merchantId} not found`);
      if (!from.includes(m.status)) throw new MerchantActionError('bad_status', `merchant ${merchantId} is ${m.status}`);
      await tx
        .update(merchants)
        .set({ status: to, statusReason: reason, decidedAt: new Date(), decidedBy: actor })
        .where(eq(merchants.id, m.id));
      const listed = to === 'approved';
      const sourcesOf = sql`SELECT id FROM shop_sources WHERE config->>'origin' = 'merchant' AND (config->>'merchantId')::bigint = ${m.id}`;
      await tx.execute(sql`UPDATE shop_sources SET enabled = ${listed}, updated_at = now() WHERE id IN (${sourcesOf})`);
      let productIds: number[] = [];
      let hiddenOffers = 0;
      if (!listed) {
        // The decision takes effect now: the offers leave product pages at once (they come back
        // with the first feed read after a reinstatement), and a shop created by the portal is paused.
        const hidden = await tx.execute<{ product_id: string | null }>(sql`
          UPDATE offers SET active = false, updated_at = now() WHERE active AND source_id IN (${sourcesOf})
          RETURNING product_id::text`);
        hiddenOffers = hidden.rows.length;
        productIds = [...new Set(hidden.rows.map((r) => r.product_id).filter((p): p is string => p !== null).map(Number))];
      }
      if (m.shopId) {
        await tx.execute(sql`
          UPDATE shops SET status = ${listed ? 'active' : 'paused'}
          WHERE id = ${m.shopId} AND legal_basis_ref = ${`merchant:${m.id}`} AND status = ${listed ? 'paused' : 'active'}`);
      }
      await tx.insert(auditLog).values({
        actor,
        action: `merchant.${to === 'approved' ? 'reinstate' : to === 'rejected' ? 'reject' : 'suspend'}`,
        entity: 'merchants',
        entityId: String(m.id),
        before: { status: m.status },
        after: { status: to, reason, ...(listed ? {} : { hiddenOffers }) },
      });
      return { shopId: m.shopId, productIds };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new MerchantActionError('domain_taken', 'another merchant is listed with this domain now');
    throw err;
  }
}

/** pending → rejected, with the statement of reasons shown to the merchant. */
export function rejectMerchant(db: Db, merchantId: number, reason: string, actor: string): Promise<TransitionResult> {
  return transition(db, merchantId, actor, ['pending'], 'rejected', reason);
}

/** approved → suspended: the feed stops, the offers are hidden at once, a portal-created shop is paused. */
export function suspendMerchant(db: Db, merchantId: number, reason: string, actor: string): Promise<TransitionResult> {
  return transition(db, merchantId, actor, ['approved'], 'suspended', reason);
}

/** suspended → approved: the feed resumes (the caller queues a read, which brings the offers back). */
export function reinstateMerchant(db: Db, merchantId: number, actor: string): Promise<TransitionResult> {
  return transition(db, merchantId, actor, ['suspended'], 'approved', null);
}
