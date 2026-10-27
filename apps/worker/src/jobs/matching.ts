import { matchOffer, pendingOffers, syncTaxonomy } from '@pretoscop/db';
import { defineJob } from './types';

export const MATCH_PENDING = 'match.pending';

/**
 * Matches pending offers in batches (M07). Queued after every source run and every 10 minutes;
 * a singleton queue, so runs never overlap. Touched products are re-rolled up.
 */
export const matchPendingJob = defineJob<{ limit?: number }>({
  name: MATCH_PENDING,
  queue: { policy: 'singleton', retryLimit: 1, retryDelay: 120, expireInSeconds: 3600 },
  schedule: { cron: '*/10 * * * *' },
  runOnStart: true,
  handler: async (job, { db, boss, log }) => {
    await syncTaxonomy(db);
    const limit = job.data?.limit ?? 5000;
    const started = Date.now();
    const touched = new Set<number>();
    const counts: Record<string, number> = {};
    // One pass: never-decided offers, plus review-queue items last scored more than a day ago.
    const offers = await pendingOffers(db, limit, { reviewAgainAfterHours: 24 });
    for (const o of offers) {
      const out = await matchOffer(db, o);
      counts[out.decision] = (counts[out.decision] ?? 0) + 1;
      if (out.productId && out.decision !== 'needs_review') touched.add(out.productId);
    }
    const processed = offers.length;
    if (touched.size > 0) {
      const ids = [...touched];
      for (let i = 0; i < ids.length; i += 500) await boss.send('rollup.touch', { productIds: ids.slice(i, i + 500) });
    }
    log.info({ processed, counts, touched: touched.size, duration_ms: Date.now() - started }, 'matching done');
  },
});
