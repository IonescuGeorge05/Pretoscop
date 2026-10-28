import { isFlagEnabled, llmInFlightBatches } from '@pretoscop/db';
import { createWorkerLlm } from '../llm/factory';
import { collectLlmBatches, runLlmMatching } from '../llm/matching';
import { defineJob } from './types';

export const LLM_MATCH = 'llm.match';

/**
 * LLM verification of the matching gray zone (M22, ADR-022), every 15 minutes: collect ended
 * batches, decide what is answered, send the rest as one Message Batch within the monthly cap.
 * Runs only with ANTHROPIC_API_KEY (setup A9) and the flag `llm.matching.enabled` (off). Switching
 * the flag off is the kill switch: batches in flight are canceled (unprocessed requests are not
 * billed), what they already processed is collected so the ledger stays exact, and no decision is
 * made. A singleton queue, so runs never overlap.
 */
export const llmMatchJob = defineJob<{ limit?: number }>({
  name: LLM_MATCH,
  queue: { policy: 'singleton', retryLimit: 0, expireInSeconds: 3600, deleteAfterSeconds: 7 * 86400 },
  schedule: { cron: '*/15 * * * *' },
  handler: async (job, { db, env, log, boss }) => {
    const { llm, reason, settings } = createWorkerLlm(env, db, log);
    const enabled = await isFlagEnabled(db, 'llm.matching.enabled');
    if (!llm) {
      if (enabled) log.warn({ reason }, 'llm.match skipped: flag on but no API key');
      return { skipped: reason };
    }
    if (!enabled) {
      const inflight = await llmInFlightBatches(db, { purposes: ['match.verify', 'attributes.extract', 'category.suggest'] });
      if (inflight.length === 0) return { skipped: 'flag llm.matching.enabled is off' };
      let canceled = 0;
      for (const b of inflight) {
        try {
          await llm.cancelBatch(b.batchId);
          canceled++;
        } catch (e) {
          log.warn({ batchId: b.batchId, error: (e as Error).message }, 'llm batch cancel failed');
        }
      }
      const collect = await collectLlmBatches(db, llm, log);
      log.info({ canceled, collect }, 'llm.match: flag off, batches in flight canceled and collected');
      return { skipped: 'flag llm.matching.enabled is off', canceled, collect };
    }
    const stats = await runLlmMatching({ db, llm, log, settings }, { limit: job.data?.limit ?? settings.maxRequests, mode: 'batch' });
    const touched = [...new Set(stats.decided.touched)];
    for (let i = 0; i < touched.length; i += 500) await boss.send('rollup.touch', { productIds: touched.slice(i, i + 500) });
    const budget = { level: stats.budget.level, ratio: Math.round(stats.budget.ratio * 1000) / 1000, usedEur: stats.budget.usedEurNanos / 1e9, capEur: stats.budget.capEur };
    const summary = { offers: stats.offers, decided: { ...stats.decided, touched: touched.length }, asked: stats.asked, submitted: stats.submitted, deferred: stats.deferred, batchId: stats.batchId, collect: stats.collect, budget };
    if (stats.stoppedByCap || stats.budget.level === 'stop') log.warn(summary, 'llm.match: monthly cap reached, requests deferred');
    else if (stats.budget.level === 'warn') log.warn(summary, 'llm.match: over 80 % of the monthly LLM cap');
    else log.info(summary, 'llm.match done');
    return summary;
  },
});
