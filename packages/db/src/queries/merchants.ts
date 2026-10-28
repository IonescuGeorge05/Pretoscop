import { shopSlugFromDomain } from '@pretoscop/core';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { merchants, type MerchantFeedFormat, type MerchantShippingRules } from '../schema/merchants';
import { shopSources, shops } from '../schema/shops';
import { auditLog } from '../schema/system';

/**
 * Merchant portal lifecycle (M20). Approval turns a verified, validated merchant into a shop (new or
 * existing) plus one feed source on the normal ingestion path (M05): `kind='feed'`, source tier 1,
 * pulled six times a day, owned by the portal (`config.origin='merchant'`, so `shops:sync` never
 * disables it). Every transition writes an `audit_log` row; rejections and suspensions keep their
 * statement of reasons (P2B Regulation art. 4).
 */

/** pg-boss job names shared by the web app (producer) and the worker. */
export const MERCHANT_JOBS = { validate: 'merchant.validate', verifyDomain: 'merchant.verify_domain' } as const;

/** Same keys as `FEED_PARSER_FOR_FORMAT` in @pretoscop/extractors (a worker test keeps them equal). */
export const MERCHANT_FEED_PARSERS: Record<MerchantFeedFormat, string> = {
  google: 'feed-google-shopping',
  compari: 'feed-compari-xml',
  csv: 'feed-csv-generic',
};

/** `shop_sources.url` prefix of an uploaded feed file (read by the recorder from the blob store). */
export const MERCHANT_UPLOAD_PREFIX = 'upload:';

export function merchantSourceKey(shopSlug: string): string {
  return `${shopSlug}:feed:merchant`;
}

/** Six pulls a day (every four hours); the minute is staggered by merchant id. */
export function merchantFeedSchedule(merchantId: number): string {
  return `${merchantId % 60} */4 * * *`;
}

export class MerchantActionError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_status' | 'domain_unverified' | 'no_feed' | 'incomplete' | 'shop_closed' | 'domain_taken',
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
 * pending → approved. Creates the shop when no shop has the merchant's domain; an existing shop
 * must already be active with access_mode other than off (registry shops change through their YAML).
 */
export async function approveMerchant(db: Db, merchantId: number, actor: string): Promise<ApproveResult> {
  try {
    return await db.transaction(async (tx) => {
      const [m] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for('update');
      if (!m) throw new MerchantActionError('not_found', `merchant ${merchantId} not found`);
      if (m.status !== 'pending') throw new MerchantActionError('bad_status', `merchant ${merchantId} is ${m.status}, not pending`);
      if (!m.domain || !m.domainVerifiedAt) throw new MerchantActionError('domain_unverified', 'the shop domain is not verified');
      if (!m.feedFormat || (!m.feedUrl && !m.feedUploadKey)) throw new MerchantActionError('no_feed', 'no feed address or file');
      if (!m.shopName) throw new MerchantActionError('incomplete', 'the shop name is missing');

      const [existing] = await tx.select().from(shops).where(eq(shops.domain, m.domain));
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
            crawlPolicy: { min_interval_ms: 5000, freshness_slo_hours: 12 },
            vatIncludedDefault: true,
            legalBasisRef: `merchant:${m.id}`,
            legalNotes: `Listed through the merchant portal; ${m.termsVersion ?? 'terms'} accepted ${m.termsAcceptedAt?.toISOString() ?? '?'}`,
          })
          .returning({ id: shops.id });
        shopId = row!.id;
        shopCreated = true;
      }

      const sourceKey = merchantSourceKey(shopSlug);
      const upload = !m.feedUrl;
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
        freshnessSloHours: upload ? 72 : 12,
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

async function transition(
  db: Db,
  merchantId: number,
  actor: string,
  from: string[],
  to: 'rejected' | 'suspended' | 'approved',
  reason: string | null,
  sourceEnabled: boolean | null,
): Promise<{ shopId: number | null }> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for('update');
    if (!m) throw new MerchantActionError('not_found', `merchant ${merchantId} not found`);
    if (!from.includes(m.status)) throw new MerchantActionError('bad_status', `merchant ${merchantId} is ${m.status}`);
    await tx
      .update(merchants)
      .set({ status: to, statusReason: reason, decidedAt: new Date(), decidedBy: actor })
      .where(eq(merchants.id, m.id));
    if (sourceEnabled !== null) {
      await tx.execute(sql`
        UPDATE shop_sources SET enabled = ${sourceEnabled}, updated_at = now()
        WHERE config->>'origin' = 'merchant' AND (config->>'merchantId')::bigint = ${m.id}`);
    }
    await tx.insert(auditLog).values({
      actor,
      action: `merchant.${to === 'approved' ? 'reinstate' : to === 'rejected' ? 'reject' : 'suspend'}`,
      entity: 'merchants',
      entityId: String(m.id),
      before: { status: m.status },
      after: { status: to, reason },
    });
    return { shopId: m.shopId };
  });
}

/** pending → rejected, with the statement of reasons shown to the merchant. */
export function rejectMerchant(db: Db, merchantId: number, reason: string, actor: string) {
  return transition(db, merchantId, actor, ['pending'], 'rejected', reason, null);
}

/** approved → suspended: the feed stops (source disabled); offers age out as stale. */
export function suspendMerchant(db: Db, merchantId: number, reason: string, actor: string) {
  return transition(db, merchantId, actor, ['approved'], 'suspended', reason, false);
}

/** suspended → approved: the feed resumes. */
export function reinstateMerchant(db: Db, merchantId: number, actor: string) {
  return transition(db, merchantId, actor, ['suspended'], 'approved', null, true);
}
