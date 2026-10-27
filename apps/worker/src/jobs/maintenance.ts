import { ensurePriceEventPartitions, pruneRequestLog } from '@pretoscop/db';
import { defineJob } from './types';

/** Keeps twelve monthly price_events partitions ahead of today (M01). */
export const partitionsJob = defineJob({
  name: 'maintenance.partitions',
  queue: { retryLimit: 3, retryDelay: 300 },
  schedule: { cron: '15 3 * * *' },
  runOnStart: true,
  handler: async (_job, { db, log }) => {
    const created = await ensurePriceEventPartitions(db, 0, 12);
    log.info({ created }, 'price_events partitions ensured');
  },
});

/** request_log keeps 30 days. */
export const requestLogPruneJob = defineJob({
  name: 'maintenance.request_log',
  queue: { retryLimit: 1 },
  schedule: { cron: '40 3 * * *' },
  handler: async (_job, { db, log }) => {
    const deleted = await pruneRequestLog(db, 30);
    log.info({ deleted }, 'request_log pruned');
  },
});
