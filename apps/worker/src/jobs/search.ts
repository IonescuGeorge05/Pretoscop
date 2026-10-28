import type { Env } from '@pretoscop/config/env';
import { createMeili, indexNames, type Meili } from '@pretoscop/search';
import { rebuildAll, recomputePopularity, syncChanged, type SyncDeps } from '@pretoscop/search/sync';
import type { Db } from '@pretoscop/db';
import type { Logger } from '@pretoscop/config/logger';
import { defineJob } from './types';

/**
 * Search index maintenance (M14, docs/03 §6.6). Two singleton queues: a sync every minute (and at
 * start, which rebuilds when Meilisearch has no watermark) and the nightly rebuild after the
 * rollup (04:30), preceded by the popularity recompute.
 */
let client: Meili | undefined;
function meili(env: Env): Meili {
  client ??= createMeili({ url: env.MEILI_URL, apiKey: env.MEILI_MASTER_KEY, timeoutMs: 30_000 });
  return client;
}

export function searchDeps(env: Env, db: Db, log?: Logger): SyncDeps {
  return { db, meili: meili(env), names: indexNames(env.MEILI_INDEX_PREFIX), log };
}

export const searchSyncJob = defineJob({
  name: 'search.sync',
  queue: { policy: 'singleton', retryLimit: 0, expireInSeconds: 3600, deleteAfterSeconds: 3600 },
  schedule: { cron: '* * * * *' },
  runOnStart: true,
  handler: async (_job, { db, env, log }) => {
    const r = await syncChanged(searchDeps(env, db, log));
    if (r.mode === 'full' || r.indexed > 0 || r.removed > 0) log.debug(r, 'search sync');
  },
});

export const searchRebuildJob = defineJob({
  name: 'search.rebuild',
  queue: { policy: 'singleton', retryLimit: 2, retryDelay: 900, expireInSeconds: 3 * 3600 },
  schedule: { cron: '0 5 * * *' },
  handler: async (_job, { db, env, log }) => {
    const popularity = await recomputePopularity(db);
    const r = await rebuildAll(searchDeps(env, db, log));
    log.info({ popularity_changed: popularity, ...r }, 'nightly search rebuild done');
  },
});
