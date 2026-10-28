import { MERCHANT_JOBS } from '@pretoscop/db';
import { verifyMerchantDomain } from '../merchant/domain';
import { validateMerchantFeed } from '../merchant/validate';
import { defineJob, type Services } from './types';

/** Merchant checks only ever run on the merchant-scoped fetcher (never the crawler's state). */
function merchantFetcherOf(services: Services) {
  if (!services.merchantFetcher) throw new Error('services.merchantFetcher is not configured: merchant checks must not use the crawler fetcher');
  return services.merchantFetcher;
}

/**
 * pg-boss `stately` queues: with the merchant id as `singletonKey`, at most one check per merchant
 * is queued and one runs (pg-boss ignores the key on standard queues). A newer request while one
 * runs waits in the queue and reads the merchant's latest state when it starts.
 */
const MERCHANT_QUEUE = { policy: 'stately', retryLimit: 0, deleteAfterSeconds: 7 * 86400 } as const;

/** Feed check requested from the merchant portal (M20): fetch, inspect, preview. */
export const merchantValidateJob = defineJob<{ merchantId: number }>({
  name: MERCHANT_JOBS.validate,
  queue: { ...MERCHANT_QUEUE, expireInSeconds: 600 },
  work: { localConcurrency: 2, pollingIntervalSeconds: 2 },
  handler: async (job, { db, env, log, services }) => {
    await validateMerchantFeed(
      { db, log, fetcher: merchantFetcherOf(services), blob: services.blob, maxBytes: env.FETCH_MAX_BODY_BYTES },
      job.data.merchantId,
    );
  },
});

/** Domain ownership check (DNS TXT record or verification file) requested from the portal. */
export const merchantVerifyDomainJob = defineJob<{ merchantId: number }>({
  name: MERCHANT_JOBS.verifyDomain,
  queue: { ...MERCHANT_QUEUE, expireInSeconds: 300 },
  work: { localConcurrency: 2, pollingIntervalSeconds: 2 },
  handler: async (job, { db, env, log, services }) => {
    await verifyMerchantDomain(
      { db, log, fetcher: merchantFetcherOf(services), blob: services.blob, maxBytes: env.FETCH_MAX_BODY_BYTES },
      job.data.merchantId,
    );
  },
});
