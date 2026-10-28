import { MERCHANT_JOBS } from '@pretoscop/db';
import { verifyMerchantDomain } from '../merchant/domain';
import { validateMerchantFeed } from '../merchant/validate';
import { defineJob } from './types';

/** Feed check requested from the merchant portal (M20): fetch, inspect, preview. */
export const merchantValidateJob = defineJob<{ merchantId: number }>({
  name: MERCHANT_JOBS.validate,
  queue: { retryLimit: 0, expireInSeconds: 600, deleteAfterSeconds: 7 * 86400 },
  work: { localConcurrency: 2, pollingIntervalSeconds: 2 },
  handler: async (job, { db, log, services }) => {
    await validateMerchantFeed({ db, log, fetcher: services.fetcher, blob: services.blob }, job.data.merchantId);
  },
});

/** Domain ownership check (DNS TXT record or verification file) requested from the portal. */
export const merchantVerifyDomainJob = defineJob<{ merchantId: number }>({
  name: MERCHANT_JOBS.verifyDomain,
  queue: { retryLimit: 0, expireInSeconds: 300, deleteAfterSeconds: 7 * 86400 },
  work: { localConcurrency: 2, pollingIntervalSeconds: 2 },
  handler: async (job, { db, log, services }) => {
    await verifyMerchantDomain({ db, log, fetcher: services.fetcher, blob: services.blob }, job.data.merchantId);
  },
});
