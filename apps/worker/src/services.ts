import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { normalizeOffer } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import { type Db, latestFxRate } from '@pretoscop/db';
import { createFetcher, createGuardedDispatcher, type DomainStateStore, type Fetcher, type FetcherDeps, ScopedDomainStateStore } from '@pretoscop/fetch';
import { createMailer } from '@pretoscop/mailer';
import { alertLinks } from '@pretoscop/notify';
import { createBlobStore } from '@pretoscop/storage';
import { createEmailSender, createNotifier, operatorFromEnv } from './alerts/notifier';
import { createPolicyResolver } from './fetch/policy';
import { PgDomainStateStore } from './fetch/pg-state';
import { PgRequestLogSink } from './fetch/request-log';
import type { AlertServices, Services } from './jobs/types';
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

/** Price-alert channels (M19 email; M27 adds push and Telegram), links and sender identity. */
export function createAlertServices(env: Env, db: Db, log: Logger): AlertServices {
  const mailer = createMailer(env, log);
  return {
    mailer,
    notifier: createNotifier({ email: createEmailSender(db, mailer, log) }),
    links: alertLinks(env.ALERTS_SECRET, env.PUBLIC_BASE_URL),
    operator: operatorFromEnv(env),
    secret: env.ALERTS_SECRET,
  };
}

function fetcherDeps(env: Env, db: Db, log: Logger, deps: Pick<FetcherDeps, 'dispatcher' | 'requestLog' | 'stateStore'>): FetcherDeps {
  return {
    ...deps,
    policyFor: createPolicyResolver(db),
    crawlEnabled: env.CRAWL_ENABLED,
    botInfoUrl: env.BOT_INFO_URL,
    defaultTimeoutMs: env.FETCH_TIMEOUT_MS,
    defaultMaxBytes: env.FETCH_MAX_BODY_BYTES,
    logger: log,
  };
}

/**
 * The fetcher for requests a merchant asks for (M20: feed checks, verification files and the pulls
 * of merchant feeds). Same identity, robots.txt rules, per-host start slots and SSRF guard as the
 * crawler's, but whatever those requests provoke (pauses, failure streaks, the daily count, a
 * robots.txt result) is kept under `merchant:` keys (ScopedDomainStateStore), so a stranger's URL can
 * never pause, slow down or use up the crawler's access to a shop.
 */
export function createMerchantFetcher(
  env: Env,
  db: Db,
  log: Logger,
  deps: Pick<FetcherDeps, 'dispatcher' | 'requestLog'> & { stateStore: DomainStateStore },
  /** Test hooks only (`sleep`, `now`). */
  overrides: Pick<FetcherDeps, 'sleep' | 'now'> = {},
): Fetcher {
  return createFetcher({ ...fetcherDeps(env, db, log, { ...deps, stateStore: new ScopedDomainStateStore(deps.stateStore, 'merchant') }), ...overrides });
}

/** Long-lived collaborators of the worker: blob store, the polite fetcher, normalizer, ops alerts. */
export function createServices(env: Env, db: Db, log: Logger): Services & { close: () => Promise<void> } {
  const requestLog = new PgRequestLogSink(db, log);
  // Only public internet addresses (M20: merchants type feed URLs); local fixtures need FETCH_ALLOW_PRIVATE_HOSTS
  // (everything) or FETCH_PRIVATE_ALLOWLIST (exact ip:port pairs).
  const dispatcher = createGuardedDispatcher({
    allowPrivate: env.FETCH_ALLOW_PRIVATE_HOSTS,
    allowTargets: env.FETCH_PRIVATE_ALLOWLIST,
    timeoutMs: env.FETCH_TIMEOUT_MS,
  });
  const state = new PgDomainStateStore(db);
  const fetcher = createFetcher(fetcherDeps(env, db, log, { dispatcher, requestLog, stateStore: state }));
  const merchantFetcher = createMerchantFetcher(env, db, log, { dispatcher, requestLog, stateStore: state });
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
    merchantFetcher,
    normalize: createNormalize(() => {
      refreshEur();
      return eur.rate;
    }),
    alert: createOpsAlert(env, log),
    revalidate: createRevalidator(env, log),
    alerts: createAlertServices(env, db, log),
    async close() {
      await requestLog.flush();
      await fetcher.close?.();
      await merchantFetcher.close?.();
      await dispatcher.close();
    },
  };
}
