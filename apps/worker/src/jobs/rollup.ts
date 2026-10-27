import {
  addDaysIso,
  bucharestToday,
  computeProductStats,
  rollupProducts,
  sendPriceOutliersToMatcher,
  upsertFxRate,
} from '@pretoscop/db';
import { defineJob } from './types';

/** Nightly: recompute the last three days for every product, then stats, then the outlier check. */
export const rollupDailyJob = defineJob({
  name: 'rollup.daily',
  queue: { retryLimit: 2, retryDelay: 600, expireInSeconds: 2 * 3600 },
  schedule: { cron: '30 4 * * *' },
  handler: async (_job, { db, log }) => {
    const today = bucharestToday();
    const started = Date.now();
    const rows = await rollupProducts(db, { productIds: null, from: addDaysIso(today, -2), to: today });
    const stats = await computeProductStats(db, null, today);
    const outliers = await sendPriceOutliersToMatcher(db);
    log.info({ rows, stats, outliers: outliers.length, duration_ms: Date.now() - started }, 'daily rollup done');
  },
});

/** Incremental: today (and yesterday) for the products touched by ingestion or matching. */
export const rollupTouchJob = defineJob<{ productIds: number[] }>({
  name: 'rollup.touch',
  queue: { retryLimit: 2, retryDelay: 60, expireInSeconds: 1800 },
  work: { batchSize: 1, localConcurrency: 1 },
  handler: async (job, { db, log }) => {
    const ids = [...new Set(job.data.productIds)].filter((n) => Number.isInteger(n));
    if (ids.length === 0) return;
    const today = bucharestToday();
    await rollupProducts(db, { productIds: ids, from: addDaysIso(today, -1), to: today });
    await computeProductStats(db, ids, today);
    log.debug({ products: ids.length }, 'rollup touch done');
  },
});

/**
 * BNR reference rates (docs/03 §6.4): one public request a day to curs.bnr.ro (not a shop). Used to
 * convert the rare EUR prices; the rate is stored with each converted event.
 */
export const fxBnrJob = defineJob({
  name: 'fx.bnr',
  queue: { retryLimit: 3, retryDelay: 1800 },
  schedule: { cron: '30 14 * * 1-5' },
  runOnStart: true,
  handler: async (_job, { db, log, services }) => {
    // Through the polite fetch layer like every other request (identified, robots.txt checked).
    const res = await services.fetcher.fetchPolite('https://curs.bnr.ro/nbrfxrates.xml', { purpose: 'feed' });
    if (!res.ok || !res.body) throw new Error(`BNR HTTP ${res.status} ${res.skipped ?? ''}`);
    const xml = res.body;
    const day = /<Cube date="(\d{4}-\d{2}-\d{2})">/.exec(xml)?.[1];
    if (!day) throw new Error('BNR: no Cube date');
    let n = 0;
    for (const m of xml.matchAll(/<Rate currency="([A-Z]{3})"(?: multiplier="(\d+)")?>([\d.]+)<\/Rate>/g)) {
      const [, cur, mult, rate] = m;
      if (!cur || !rate) continue;
      const perUnit = (Number(rate) / Number(mult ?? 1)).toFixed(4);
      await upsertFxRate(db, day, cur, perUnit);
      n++;
    }
    log.info({ day, rates: n }, 'BNR rates stored');
  },
});
