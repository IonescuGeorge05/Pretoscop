import { promotedMaintenance } from '@pretoscop/db';
import { defineJob } from './types';

/** The web's cache tags of promoted slots (`promoted`, `promoted:c{id}`, `promoted:categorii`). */
const TAG = /^promoted(?::[\w-]+)?$/;

/**
 * Refreshes promoted slots on every web replica (M25). The replica that made the change (a
 * campaign edit, a top-up, a click that used up a budget) has already refreshed its own cache;
 * this job tells the others, through the same /api/revalidate the price updates use.
 */
export const promotedRefreshJob = defineJob<{ tags?: unknown }>({
  name: 'promoted.refresh',
  queue: { retryLimit: 2, retryDelay: 30 },
  handler: async (job, { services, log }) => {
    const tags = (Array.isArray(job.data.tags) ? job.data.tags : []).filter((t): t is string => typeof t === 'string' && TAG.test(t)).slice(0, 200);
    if (tags.length === 0) return;
    const done = await services.revalidate(tags);
    log.debug({ tags: tags.length, done }, 'promoted slots refreshed');
  },
});

/**
 * Daily at 00:05 Romania time (M25): daily caps restart at midnight, so every slot recomputes
 * (a campaign that ran out yesterday may show again); session and IP hashes of promoted clicks
 * older than 30 days are cleared (ROPA P13); checkouts nobody finished within 24 hours close.
 */
export const promotedDailyJob = defineJob({
  name: 'promoted.daily',
  queue: { retryLimit: 3, retryDelay: 300 },
  schedule: { cron: '5 0 * * *' },
  handler: async (_job, { db, services, log }) => {
    const res = await promotedMaintenance(db, 30);
    await services.revalidate(['promoted']);
    log.info(res, 'promoted placements: daily maintenance');
    return res;
  },
});
