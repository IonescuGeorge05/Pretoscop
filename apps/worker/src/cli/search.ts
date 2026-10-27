/**
 * Search index maintenance from the command line (M14).
 *   pnpm --filter @pretoscop/worker search:rebuild   full blue/green rebuild, prints counts (read-only on the
 *                                                    database; add --popularity to recompute popularity first,
 *                                                    as the nightly job does)
 *   pnpm --filter @pretoscop/worker search:sync      incremental sync since the watermark
 *   pnpm --filter @pretoscop/worker search status    watermark, document count, index sizes
 *   pnpm --filter @pretoscop/worker search drop      deletes the indexes of MEILI_INDEX_PREFIX (refused without a prefix)
 * Index names follow MEILI_INDEX_PREFIX (the e2e suite runs with `e2e_`).
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '@pretoscop/db';
import { type EnqueuedTask } from '@pretoscop/search';
import { readMeta, rebuildAll, recomputePopularity, syncChanged } from '@pretoscop/search/sync';
import { searchDeps } from '../jobs/search';

loadRootEnvFile();
const env = getEnv();
const cmd = process.argv[2] ?? 'status';
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
const deps = searchDeps(env, db);
try {
  if (!(await deps.meili.healthy())) throw new Error(`Meilisearch is not reachable at ${env.MEILI_URL}`);
  if (cmd === 'rebuild') {
    const popularity = process.argv.includes('--popularity') ? await recomputePopularity(db) : null;
    console.log(JSON.stringify({ popularity_changed: popularity, ...(await rebuildAll(deps)), prefix: env.MEILI_INDEX_PREFIX }));
  } else if (cmd === 'sync') {
    console.log(JSON.stringify(await syncChanged(deps)));
  } else if (cmd === 'drop') {
    if (!env.MEILI_INDEX_PREFIX) throw new Error('refusing to drop the unprefixed (live) indexes; set MEILI_INDEX_PREFIX');
    const list = await deps.meili.request<{ results: Array<{ uid: string }> }>('GET', '/indexes?limit=1000');
    const mine = list.results.map((i) => i.uid).filter((uid) => uid.startsWith(env.MEILI_INDEX_PREFIX));
    for (const uid of mine) await deps.meili.waitForTask(await deps.meili.request<EnqueuedTask>('DELETE', `/indexes/${uid}`));
    console.log(JSON.stringify({ dropped: mine }));
  } else if (cmd === 'status') {
    const meta = await readMeta(deps.meili, deps.names);
    const stats = await deps.meili.request<{ indexes: Record<string, { numberOfDocuments: number }> }>('GET', '/stats');
    const docs = Object.fromEntries(Object.entries(stats.indexes).filter(([k]) => Object.values(deps.names).includes(k)).map(([k, v]) => [k, v.numberOfDocuments]));
    console.log(JSON.stringify({ names: deps.names, meta, documents: docs }, null, 2));
  } else {
    console.error('usage: search rebuild|sync|status|drop');
    process.exitCode = 2;
  }
} finally {
  deps.meili.close();
  await pool.end();
}
