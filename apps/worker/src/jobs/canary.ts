import { runExtractorCanary } from '../ops/canary';
import { defineJob } from './types';

/**
 * Weekly extractor canary (M21): Monday 04:30 Bucharest, inside the off-peak window the bot page
 * promises. Off until the `extractors.canary.enabled` flag is on; needs CRAWL_ENABLED and
 * `crawl.enabled` like any request to a shop. Idempotent per ISO week.
 */
export const extractorCanaryJob = defineJob<{ shopSlugs?: string[] }>({
  name: 'extractors.canary',
  queue: { retryLimit: 1, retryDelay: 1800, expireInSeconds: 4 * 3600, deleteAfterSeconds: 30 * 86400 },
  work: { localConcurrency: 1, pollingIntervalSeconds: 30 },
  schedule: { cron: '30 4 * * 1' },
  handler: async (job, { db, env, services, log }) =>
    runExtractorCanary({ db, env, fetcher: services.fetcher, alert: services.alert, log }, { shopSlugs: job.data?.shopSlugs }),
});
