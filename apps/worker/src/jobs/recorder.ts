import { runSource } from '../recorder/run-source';
import { SOURCE_RUN, schedulerTick } from '../recorder/scheduler';
import { backupDatabase, pruneBackups, restoreTest } from '../ops/backup';
import { defineJob } from './types';

/** Every minute: queue the sources whose cron is due (M05). */
export const schedulerTickJob = defineJob({
  name: 'scheduler.tick',
  queue: { retryLimit: 0, expireInSeconds: 120, deleteAfterSeconds: 3600 },
  schedule: { cron: '* * * * *' },
  handler: async (_job, { db, boss, env, log }) => {
    await schedulerTick(db, boss, env, log);
  },
});

/**
 * One source run. At most one run per shop at a time (pg-boss group = shop slug), up to six shops
 * in parallel; the fetch layer additionally serializes requests per host.
 */
export const sourceRunJob = defineJob<{ sourceId: number; trigger?: 'schedule' | 'manual' }>({
  name: SOURCE_RUN,
  queue: { retryLimit: 1, retryDelay: 600, expireInSeconds: 6 * 3600, deleteAfterSeconds: 14 * 86400 },
  work: { localConcurrency: 6, localGroupConcurrency: 1, pollingIntervalSeconds: 5 },
  handler: async (job, { db, env, log, services }) => {
    await runSource({ db, env, log, ...services }, job.data.sourceId, { trigger: job.data.trigger ?? 'schedule' });
  },
});

/** Nightly logical backup to the blob store (R2 in production), 14 days kept. */
export const backupJob = defineJob({
  name: 'backup.nightly',
  queue: { retryLimit: 2, retryDelay: 900, expireInSeconds: 3 * 3600 },
  schedule: { cron: '30 0 * * *' },
  handler: async (_job, { env, log, services }) => {
    try {
      await backupDatabase(env, services.blob, log);
      const pruned = await pruneBackups(services.blob, 14);
      log.info({ pruned }, 'old backups pruned');
    } catch (err) {
      await services.alert('Nightly backup failed', { error: (err as Error).message });
      throw err;
    }
  },
});

/** Weekly restore of the latest backup into a scratch database (docs/03 §9). */
export const restoreTestJob = defineJob({
  name: 'backup.restore_test',
  queue: { retryLimit: 1, expireInSeconds: 3 * 3600 },
  schedule: { cron: '0 5 * * 0' },
  handler: async (_job, { env, log, services }) => {
    try {
      await restoreTest(env, services.blob, log);
    } catch (err) {
      await services.alert('Weekly restore test failed', { error: (err as Error).message });
      throw err;
    }
  },
});
