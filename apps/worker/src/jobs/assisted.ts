import { AUTO_PAUSE_BELOW, AUTO_PAUSE_DAYS, autoPauseAssistedShops } from '../ops/assisted';
import { raiseAlert } from './ops';
import { defineJob } from './types';

/**
 * Daily (09:15 Bucharest): auto-pause of assisted shops whose success rate stayed below 80% for 7
 * days (M05B). The pause is the kill switch of every source of the shop, with an audit row and an
 * ops alert; nothing escalates to other tooling, and only a founder resumes the shop.
 */
export const assistedHealthJob = defineJob({
  name: 'assisted.health',
  queue: { retryLimit: 1, retryDelay: 600, expireInSeconds: 600, deleteAfterSeconds: 30 * 86_400 },
  schedule: { cron: '15 9 * * *' },
  handler: async (_job, { db, boss, log }) => {
    const decisions = await autoPauseAssistedShops(db);
    for (const d of decisions.filter((x) => x.paused)) {
      await raiseAlert(boss, {
        key: `assisted-auto-pause:${d.shop}`,
        message: `Assisted access to ${d.shop} paused automatically: success below ${AUTO_PAUSE_BELOW * 100}% on each of the last ${AUTO_PAUSE_DAYS} days`,
        details: { shop: d.shop, sources_killed: d.sources.length, runbook: 'infra/runbooks/assisted-access.md' },
        everySeconds: 86_400,
      });
      log.warn({ shop: d.shop, sources: d.sources, days: d.days }, 'assisted shop auto-paused');
    }
    log.info({ checked: decisions.map((d) => d.shop), paused: decisions.filter((d) => d.paused).map((d) => d.shop) }, 'assisted health checked');
  },
});
