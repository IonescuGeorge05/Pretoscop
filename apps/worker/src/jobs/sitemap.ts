import { buildSitemaps } from '../sitemap/build';
import { defineJob } from './types';

/** Data-driven sitemaps (M16): nightly after the rollup (04:30) and the search rebuild (05:00), and at start. */
export const sitemapBuildJob = defineJob({
  name: 'sitemap.build',
  queue: { policy: 'singleton', retryLimit: 2, retryDelay: 900, expireInSeconds: 3600 },
  schedule: { cron: '30 5 * * *' },
  runOnStart: true,
  handler: async (_job, { db, env, log, services }) => {
    await buildSitemaps({ db, blob: services.blob, baseUrl: env.PUBLIC_BASE_URL, log });
  },
});
