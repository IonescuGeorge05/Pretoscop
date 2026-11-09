import { isFlagEnabled, pruneB2bLogs, reresolveB2bSkus } from '@pretoscop/db';
import { runB2bDigest } from '../b2b/digest';
import { defineJob } from './types';

/**
 * M28 daily digest: after the night's rollups (04:30) and the morning recorder runs, every member
 * who wants it gets the last 24 hours of observed changes. Off until `b2b.digest.enabled`.
 */
export const b2bDigestJob = defineJob({
  name: 'b2b.digest',
  queue: { policy: 'singleton', retryLimit: 2, retryDelay: 900, expireInSeconds: 3600 },
  schedule: { cron: '45 7 * * *' },
  handler: async (_job, { db, log, services }) => {
    if (!(await isFlagEnabled(db, 'b2b.digest.enabled'))) return;
    const started = Date.now();
    const r = await runB2bDigest({ db, log, mailer: services.alerts.mailer, operator: services.alerts.operator, secret: services.alerts.secret });
    log.info({ ...r, duration_ms: Date.now() - started }, 'b2b digest done');
    if (r.failed > 0) throw new Error(`b2b digest: ${r.failed} sends failed (claims released for the retry)`);
  },
});

/** M28 nightly upkeep: unmatched SKUs tried again, merged products followed (after matching). */
export const b2bResolveJob = defineJob({
  name: 'b2b.resolve',
  queue: { policy: 'singleton', retryLimit: 2, retryDelay: 600, expireInSeconds: 3600 },
  schedule: { cron: '40 5 * * *' },
  handler: async (_job, { db, log }) => {
    const started = Date.now();
    const r = await reresolveB2bSkus(db, null);
    if (r.followed + r.folded + r.newlyMatched > 0) log.info({ ...r, duration_ms: Date.now() - started }, 'b2b skus re-resolved');
  },
});

/** M28 retention: API usage counters after 400 days, digest receipts after 90. */
export const b2bPruneJob = defineJob({
  name: 'b2b.prune',
  queue: { retryLimit: 1, retryDelay: 3600, expireInSeconds: 1800 },
  schedule: { cron: '50 3 * * 0' },
  handler: async (_job, { db, log }) => {
    const r = await pruneB2bLogs(db);
    log.info(r, 'b2b logs pruned');
  },
});
