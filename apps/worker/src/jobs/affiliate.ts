import { applyTwoPerformantPrograms, bucharestToday, addDaysIso, shopForProgram, upsertCommissions } from '@pretoscop/db';
import { clickIdFromSub, commissionStatus, moneyToBani, TwoPerformantClient } from '../affiliate/twoperformant';
import { defineJob } from './types';

function client(env: { TWOPERFORMANT_EMAIL?: string; TWOPERFORMANT_PASSWORD?: string; TWOPERFORMANT_API_URL: string }): TwoPerformantClient | null {
  if (!env.TWOPERFORMANT_EMAIL || !env.TWOPERFORMANT_PASSWORD) return null;
  return new TwoPerformantClient({ baseUrl: env.TWOPERFORMANT_API_URL, email: env.TWOPERFORMANT_EMAIL, password: env.TWOPERFORMANT_PASSWORD });
}

/**
 * Nightly program sync (M24): approval status and the "Price Comparison Services" permission of
 * every 2Performant program into affiliate_programs. A program that stops allowing comparators
 * gets plain links on the next page render (cached product pages are expired) and an alert.
 */
export const affiliateSyncJob = defineJob({
  name: 'affiliate.sync',
  queue: { retryLimit: 2, retryDelay: 1800 },
  schedule: { cron: '15 5 * * *' },
  handler: async (_job, { db, env, log, services }) => {
    const c = client(env);
    if (!c) {
      log.info('affiliate sync skipped: no 2Performant account configured (A6/A7)');
      return;
    }
    const programs = await c.programs();
    const res = await applyTwoPerformantPrograms(db, programs, 'system:affiliate.sync', bucharestToday());
    for (const ch of res.changes) {
      if (ch.before?.comparatorPolicy === 'allowed' && ch.after.comparatorPolicy !== 'allowed') {
        await services.alert(`Affiliate program no longer allows comparators: ${ch.shopSlug}`, { before: ch.before, after: ch.after });
      }
    }
    if (res.changes.length) await services.revalidate(['products']);
    log.info({ programs: programs.length, changes: res.changes.length, unmatched: res.unmatched.length }, 'affiliate programs synced');
  },
});

/** Nightly commission import (M24): the last 45 days, because statuses change for weeks. */
export const commissionsImportJob = defineJob({
  name: 'commissions.import',
  queue: { retryLimit: 2, retryDelay: 1800 },
  schedule: { cron: '15 6 * * *' },
  handler: async (_job, { db, env, log }) => {
    const c = client(env);
    if (!c) {
      log.info('commission import skipped: no 2Performant account configured (A6/A7)');
      return;
    }
    const today = bucharestToday();
    const rows = await c.commissions(addDaysIso(today, -45), today);
    const input = [];
    for (const r of rows) {
      const code = r.program?.unique_code ?? (r.program?.id !== undefined ? String(r.program.id) : null);
      input.push({
        network: '2performant',
        networkCommissionId: String(r.id),
        shopId: code ? await shopForProgram(db, '2performant', code) : null,
        programExternalId: code,
        clickId: clickIdFromSub(r.stats_tags),
        status: commissionStatus(r.status),
        amountBani: moneyToBani(r.amount) ?? 0,
        saleAmountBani: moneyToBani(r.public_action_data?.amount),
        currency: r.currency ?? 'RON',
        occurredAt: new Date(r.created_at),
        networkUpdatedAt: r.updated_at ? new Date(r.updated_at) : null,
        raw: r as unknown as Record<string, unknown>,
      });
    }
    const res = await upsertCommissions(db, input);
    log.info({ commissions: rows.length, ...res }, 'commissions imported');
  },
});
