import { isFlagEnabled } from '@pretoscop/db';
import { createWorkerIcecat, icecatLangs } from '../icecat/client';
import { syncIcecat } from '../icecat/sync';
import { defineJob } from './types';

export const ICECAT_SYNC = 'icecat.sync';

/**
 * Daily Open Icecat enrichment (M11), after the night's crawl and rollups. Runs only with the flag
 * `icecat.enabled` (off by default) and an account name (`ICECAT_USERNAME`, setup B1); a singleton
 * queue, so runs never overlap. Before enabling it, the product page must show the Icecat credit
 * wherever Icecat images or specs appear (it does from M11) and M16's robots.txt must keep AI
 * crawlers away (packages/icecat/README.md).
 */
export const icecatSyncJob = defineJob<{ limit?: number }>({
  name: ICECAT_SYNC,
  queue: {
    policy: 'singleton',
    retryLimit: 0,
    expireInSeconds: 6 * 3600,
    deleteAfterSeconds: 14 * 86400,
  },
  schedule: { cron: '30 5 * * *' },
  handler: async (job, { db, env, log, services }) => {
    if (!(await isFlagEnabled(db, 'icecat.enabled'))) {
      log.info('icecat.sync skipped: flag icecat.enabled is off');
      return { skipped: 'flag icecat.enabled is off' };
    }
    if (!env.ICECAT_USERNAME) {
      log.warn('icecat.sync skipped: ICECAT_USERNAME is not set (Open Icecat account, setup B1)');
      return { skipped: 'no Open Icecat account' };
    }
    const icecat = createWorkerIcecat(env, db, log);
    try {
      const stats = await syncIcecat(
        { db, blob: services.blob, client: icecat.client, log },
        { langs: icecatLangs(env), limit: job.data?.limit ?? env.ICECAT_DAILY_BATCH },
      );
      if (stats.stopped)
        await services.alert('Icecat sync stopped', {
          reason: stats.stopped,
          looked: stats.looked,
        });
      if (stats.capReached)
        await services.alert('Icecat monthly download cap reached', {
          cap: env.ICECAT_MONTHLY_CAP,
        });
      return stats;
    } finally {
      await icecat.close();
    }
  },
});
