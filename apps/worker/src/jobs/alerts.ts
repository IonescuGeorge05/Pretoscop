import { deliverAlerts } from '../alerts/deliver';
import { enabledChannels, evaluateAlerts } from '../alerts/evaluate';
import { runAlertRetention } from '../alerts/retention';
import { defineJob } from './types';

export const ALERTS_EVALUATE = 'alerts.evaluate';
export const ALERTS_DELIVER = 'alerts.deliver';

/**
 * M19: evaluates the alerts watching the touched products (queued by rollup.touch after price
 * changes and matching) or, nightly after the 04:30 rollup, every active alert. Queues one
 * notification per alert that fires, then asks for a delivery.
 */
export const alertsEvaluateJob = defineJob<{ productIds?: number[] }>({
  name: ALERTS_EVALUATE,
  queue: { retryLimit: 2, retryDelay: 120, expireInSeconds: 1800 },
  work: { batchSize: 1, localConcurrency: 1 },
  schedule: { cron: '30 7 * * *' },
  handler: async (job, { db, boss, log }) => {
    const ids = Array.isArray(job.data?.productIds) ? [...new Set(job.data.productIds)].filter((n) => Number.isInteger(n)) : null;
    const channels = await enabledChannels(db);
    if (channels.length === 0) return;
    const started = Date.now();
    const r = await evaluateAlerts(db, { productIds: ids, channels, log });
    if (r.queued > 0) await boss.send(ALERTS_DELIVER, {});
    log.info({ products: ids?.length ?? 'all', channels, ...r, duration_ms: Date.now() - started }, 'alerts evaluated');
  },
});

/**
 * Sends the queued notifications: one message per user and channel; push and Telegram wait for
 * 08:00. A stately queue: at most one delivery runs and one waits, so bursts coalesce. Also every
 * five minutes, for retries and the morning batch.
 */
export const alertsDeliverJob = defineJob({
  name: ALERTS_DELIVER,
  queue: { policy: 'stately', retryLimit: 1, retryDelay: 60, expireInSeconds: 1800 },
  schedule: { cron: '*/5 * * * *' },
  handler: async (_job, { db, log, services }) => {
    const channels = await enabledChannels(db);
    if (channels.length === 0) return;
    const r = await deliverAlerts({ db, log, ...services.alerts }, { channels });
    if (r.messages + r.recovered + r.skipped > 0) log.info({ channels, ...r }, 'alerts delivered');
  },
});

/** Nightly retention: pending requests, inactive accounts (with notice), evidence, clicks/events. */
export const alertsRetentionJob = defineJob({
  name: 'alerts.retention',
  queue: { retryLimit: 2, retryDelay: 1800, expireInSeconds: 3600 },
  schedule: { cron: '20 3 * * *' },
  handler: async (_job, { db, log, services }) => {
    const r = await runAlertRetention({ db, log, ...services.alerts });
    log.info(r, 'alert retention done');
  },
});
