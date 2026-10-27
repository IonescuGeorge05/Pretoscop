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
  handler: async (_job, { db, log, services }) => {
    const today = bucharestToday();
    const started = Date.now();
    const rows = await rollupProducts(db, { productIds: null, from: addDaysIso(today, -2), to: today });
    const stats = await computeProductStats(db, null, today);
    const outliers = await sendPriceOutliersToMatcher(db);
    await services.revalidate(['products']);
    log.info({ rows, stats, outliers: outliers.length, duration_ms: Date.now() - started }, 'daily rollup done');
  },
});

/** Incremental: today (and yesterday) for the products touched by ingestion or matching. */
export const rollupTouchJob = defineJob<{ productIds: number[] }>({
  name: 'rollup.touch',
  queue: { retryLimit: 2, retryDelay: 60, expireInSeconds: 1800 },
  work: { batchSize: 1, localConcurrency: 1 },
  handler: async (job, { db, log, services }) => {
    const ids = [...new Set(job.data.productIds)].filter((n) => Number.isInteger(n));
    if (ids.length === 0) return;
    const today = bucharestToday();
    await rollupProducts(db, { productIds: ids, from: addDaysIso(today, -1), to: today });
    await computeProductStats(db, ids, today);
    const revalidated = await services.revalidate(ids.map((id) => `product:${id}`));
    log.debug({ products: ids.length, revalidated }, 'rollup touch done');
  },
});

/**
 * Reference exchange rates for the rare non-RON prices (docs/03 §6.4). BNR's curs.bnr.ro
 * disallows every robot in robots.txt, so we use the ECB's daily reference rates (EUR base, RON
 * included), read through the polite fetch layer like every other request. RON per unit of each
 * currency is stored with source 'ecb'.
 */
export const fxRatesJob = defineJob({
  name: 'fx.rates',
  queue: { retryLimit: 3, retryDelay: 1800 },
  schedule: { cron: '30 17 * * 1-5' },
  runOnStart: true,
  handler: async (_job, { db, log, services }) => {
    const res = await services.fetcher.fetchPolite('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { purpose: 'feed' });
    if (!res.ok || !res.body) throw new Error(`ECB HTTP ${res.status} ${res.skipped ?? ''}`);
    const xml = res.body;
    const day = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
    if (!day) throw new Error('ECB: no reference date');
    const rates = new Map<string, number>();
    for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates.set(m[1]!, Number(m[2]));
    const ronPerEur = rates.get('RON');
    if (!ronPerEur) throw new Error('ECB: no RON rate');
    await upsertFxRate(db, day, 'EUR', ronPerEur.toFixed(4), 'ecb');
    let n = 1;
    for (const [cur, perEur] of rates) {
      if (cur === 'RON' || !perEur) continue;
      await upsertFxRate(db, day, cur, (ronPerEur / perEur).toFixed(4), 'ecb');
      n++;
    }
    log.info({ day, rates: n, ronPerEur }, 'ECB reference rates stored');
  },
});
