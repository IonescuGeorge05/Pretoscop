import { createHash } from 'node:crypto';
import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { normalizeOffer } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import { type AlertChannel, type Db, latestFxRate } from '@pretoscop/db';
import { createFetcher } from '@pretoscop/fetch';
import { createMailer } from '@pretoscop/mailer';
import { alertLinks, createPushSender, createTelegramClient } from '@pretoscop/notify';
import { createBlobStore } from '@pretoscop/storage';
import { createPushChannelSender, createTelegramChannelSender } from './alerts/channels';
import { createEmailSender, createNotifier, operatorFromEnv, type ChannelSender } from './alerts/notifier';
import { createPolicyResolver } from './fetch/policy';
import { PgDomainStateStore } from './fetch/pg-state';
import { PgRequestLogSink } from './fetch/request-log';
import type { AlertServices, Services } from './jobs/types';
import { createOpsAlert } from './ops/alert';
import { createRevalidator } from './ops/revalidate';
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
    const gtin14 = n.gtinQuality === 'valid' ? n.gtin14 : null;
    // Ambiguous or component brands must not become hard matching constraints (M06 report).
    const brandName = n.brandName && (n.brandKnown || (n.brandConfidence ?? 0) >= 0.7) ? n.brandName : null;
    const identityHash = createHash('sha256')
      .update([n.titleMatch, gtin14 ?? '', n.mpnNorm ?? '', brandName ?? ''].join('|'))
      .digest('hex');
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
  const push = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? createPushSender({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }) : undefined;
  const telegram = env.TELEGRAM_BOT_TOKEN ? createTelegramClient({ token: env.TELEGRAM_BOT_TOKEN, apiBase: env.TELEGRAM_API_BASE }) : undefined;
  const senders: Partial<Record<AlertChannel, ChannelSender>> = { email: createEmailSender(db, mailer, log) };
  if (push) senders.push = createPushChannelSender(db, push, log);
  if (telegram) senders.telegram = createTelegramChannelSender(db, telegram, log);
  return {
    mailer,
    notifier: createNotifier(senders),
    channels: Object.keys(senders) as AlertChannel[],
    ...(push ? { push } : {}),
    ...(telegram ? { telegram } : {}),
    links: alertLinks(env.ALERTS_SECRET, env.PUBLIC_BASE_URL),
    operator: operatorFromEnv(env),
    secret: env.ALERTS_SECRET,
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
    alerts: createAlertServices(env, db, log),
    async close() {
      await requestLog.flush();
      await fetcher.close?.();
    },
  };
}
