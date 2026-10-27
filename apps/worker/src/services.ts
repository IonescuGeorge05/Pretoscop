import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { normalizeOffer } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import { type Db, latestFxRate } from '@pretoscop/db';
import { createFetcher } from '@pretoscop/fetch';
import { createBlobStore } from '@pretoscop/storage';
import { createPolicyResolver } from './fetch/policy';
import { PgDomainStateStore } from './fetch/pg-state';
import { PgRequestLogSink } from './fetch/request-log';
import type { Services } from './jobs/types';
import { createOpsAlert } from './ops/alert';
import { createRevalidator } from './ops/revalidate';
import { offerIdentity } from './recorder/identity';
import type { NormalizeFn } from './recorder/types';

/**
 * RawOffer → observation through @pretoscop/core's `normalizeOffer` (M06). Rejected offers carry
 * their reasons; accepted ones get the identity hash that drives re-matching (M07).
 */
export function createNormalize(eurRonRate: () => number | null): NormalizeFn {
  return (raw, ctx) => {
    const n = normalizeOffer(raw, {
      shop: {
        slug: ctx.shop.slug,
        shippingRules: ctx.shop.shippingRules,
        vatIncludedDefault: ctx.shop.vatIncludedDefault,
      },
      observedAt: ctx.observedAt,
      eurRonRate: eurRonRate(),
      hash: contentHash,
    });
    if (!n.ok) return { rejectReason: n.rejects.join(', ') || 'rejected' };
    const { gtin14, brandName, identityHash } = offerIdentity(n);
    return {
      observation: {
        shopId: ctx.shop.id,
        sourceId: ctx.sourceId,
        sourceTier: ctx.sourceTier,
        runId: ctx.runId,
        externalId: n.externalId,
        url: n.url,
        affiliateUrl: n.affiliateUrl,
        titleRaw: n.titleRaw,
        titleClean: n.titleClean,
        titleAscii: n.titleAscii,
        brandRaw: n.brandRaw,
        brandName,
        mpnRaw: n.mpnRaw,
        mpnNorm: n.mpnNorm,
        mpnSource: n.mpnSource,
        gtinRaw: n.gtinRaw,
        gtin14,
        categoryRaw: n.categoryRaw,
        attributes: n.attributes as Record<string, unknown>,
        priceBani: n.priceBani,
        oldPriceBani: n.oldPriceBani,
        shopLowest30dBani: n.shopLowest30dBani,
        currency: n.currency,
        fxRate: n.fxRate === null ? null : n.fxRate.toFixed(4),
        // The stated delivery cost only (hashed, kept in history); rule-based estimates stay in totalBani.
        shippingBani: n.shippingBani,
        shippingNote: raw.shippingNote ?? null,
        shippingEstimated: n.shippingEstimated,
        totalBani: n.totalBani,
        availability: n.availability,
        condition: n.condition,
        conditionDetail: n.conditionDetail,
        sellerName: n.sellerName,
        sellerType: n.isMarketplaceSeller ? 'marketplace' : 'shop',
        isBundle: n.isBundle,
        isAccessory: n.isAccessory,
        identityHash,
        contentHash: n.contentHash,
        observedAt: ctx.observedAt,
      },
    };
  };
}

/** Long-lived collaborators of the worker: blob store, the polite fetcher, normalizer, ops alerts. */
export function createServices(env: Env, db: Db, log: Logger): Services & { close: () => Promise<void> } {
  const requestLog = new PgRequestLogSink(db, log);
  const fetcher = createFetcher({
    policyFor: createPolicyResolver(db),
    stateStore: new PgDomainStateStore(db),
    requestLog,
    crawlEnabled: env.CRAWL_ENABLED,
    botInfoUrl: env.BOT_INFO_URL,
    defaultTimeoutMs: env.FETCH_TIMEOUT_MS,
    defaultMaxBytes: env.FETCH_MAX_BODY_BYTES,
    logger: log,
  });
  let eur: { rate: number | null; at: number } = { rate: null, at: 0 };
  const refreshEur = () => {
    if (Date.now() - eur.at < 3600_000) return;
    eur = { rate: eur.rate, at: Date.now() };
    void latestFxRate(db, 'EUR')
      .then((r) => {
        if (r) eur = { rate: Number(r.rate), at: Date.now() };
      })
      .catch(() => undefined);
  };
  refreshEur();
  return {
    blob: createBlobStore(env),
    fetcher,
    normalize: createNormalize(() => {
      refreshEur();
      return eur.rate;
    }),
    alert: createOpsAlert(env, log),
    revalidate: createRevalidator(env, log),
    async close() {
      await requestLog.flush();
      await fetcher.close?.();
    },
  };
}
