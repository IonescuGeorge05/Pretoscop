/**
 * LLM verification of the review queue (M22), by hand:
 *   pnpm --filter @pretoscop/worker llm:match --dry-run [--limit 50]   what would be asked, worst case and estimated cost (no call, no write)
 *   pnpm --filter @pretoscop/worker llm:match --mock [--limit 50]      the whole flow against a local stand-in of the API; decisions printed, nothing written
 *   pnpm --filter @pretoscop/worker llm:match [--sync] [--limit 50]     a real pass (needs ANTHROPIC_API_KEY and the flag llm.matching.enabled): one batch, or --sync calls now
 * Prints the review queue size before and after.
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, llmGrayZoneOffers, sql } from '@pretoscop/db';
import { estimateCost, monthStartBucharest, usdToEurNanos, worstCaseUsdNanos } from '@pretoscop/llm';
import { cliLlm, eur, MOCK_BANNER } from '../llm/cli';
import { eurPerUsdFrom, llmSettings } from '../llm/factory';
import { planGrayZone, previewLlmMatching, runLlmMatching } from '../llm/matching';

loadRootEnvFile();
const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, mock: { type: 'boolean' }, sync: { type: 'boolean' }, limit: { type: 'string' } } });
const env = getEnv();
const log = createLogger('llm-match', { level: 'warn' });
const pool = createPool(env.DATABASE_URL, 3);
const db = createDb(pool);
const limit = Number(values.limit ?? 50);

async function queueSize(): Promise<number> {
  const r = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM offers WHERE match_status = 'pending' AND matched_at IS NOT NULL AND active AND NOT blacklisted`);
  return Number(r.rows[0]?.n ?? 0);
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).padEnd(n);

try {
  const before = await queueSize();
  console.log(`review queue: ${before} offers`);
  if (values['dry-run']) {
    const settings = llmSettings(env);
    const gray = await llmGrayZoneOffers(db, limit);
    const plan = await planGrayZone(db, gray, settings, log);
    const rate = await eurPerUsdFrom(db, env, log)();
    let worst = 0;
    for (const it of plan.items) {
      worst += usdToEurNanos(worstCaseUsdNanos(it.req.model, { maxInputTokens: it.req.maxInputTokens, maxTokens: it.req.maxTokens, batch: true }), rate);
      const g = gray.find((x) => x.offer.id === (it.subject.kind === 'category' ? -1 : it.subject.offerId));
      const product = it.subject.kind === 'pair' ? g?.candidates.find((c) => c.productId === (it.subject as { productId: number }).productId)?.side.title : '(attribute extraction)';
      console.log(`${it.req.model.padEnd(18)} ${it.req.promptId.padEnd(11)} ${short(g?.offer.title ?? '?', 60)} ⟷ ${short(product ?? '?', 60)}`);
    }
    const est = estimateCost(plan.items.map((i) => i.req), { batch: true });
    console.log(`\n${gray.length} review items eligible for the LLM (limit ${limit}); ${plan.items.length} requests to send; ${plan.decisions.length} decisions already possible from stored answers`);
    console.log(`worst case reserved under the cap: ${eur(worst)}; estimated cost (price table, est. tokens, batch): ${eur(usdToEurNanos(est.usdNanos, rate))}`);
    if (plan.items.length) console.log(`estimated cost per 1,000 requests: ${eur(usdToEurNanos(Math.round((est.usdNanos / plan.items.length) * 1000), rate), 3)}`);
    console.log('dry run: nothing sent, nothing written');
  } else {
    const c = await cliLlm(env, db, log, { mock: !!values.mock });
    if ('error' in c) {
      console.error(c.error);
      process.exitCode = 2;
    } else {
      try {
        if (c.mock) {
          console.log(MOCK_BANNER);
          const p = await previewLlmMatching({ db, llm: c.llm, log, settings: c.settings }, { limit });
          for (const { offer, decision } of p.decisions) {
            const target = decision.action === 'accept' ? `→ #${decision.productId} (${decision.model} ${decision.confidence.toFixed(2)})` : decision.action === 'reject' ? `× ${decision.productIds.map((x) => `#${x}`).join(',')}` : decision.reason;
            console.log(`${decision.action.padEnd(7)} ${short(offer.offer.title, 70)} ${target}`);
          }
          const counts = p.decisions.reduce<Record<string, number>>((m, d) => ({ ...m, [d.decision.action]: (m[d.decision.action] ?? 0) + 1 }), {});
          console.log(`\n${p.offers.length} review items, ${p.asked} requests (mock): ${JSON.stringify(counts)}; queue would go ${before} → ${before - (counts.accept ?? 0) - (counts.reject ?? 0)}`);
          console.log('mock preview: nothing written to the database');
        } else {
          const s = await runLlmMatching({ db, llm: c.llm, log, settings: c.settings }, { limit, mode: values.sync ? 'sync' : 'batch' });
          console.log(JSON.stringify({ offers: s.offers, decided: { ...s.decided, touched: s.decided.touched.length }, asked: s.asked, submitted: s.submitted, deferred: s.deferred, batchId: s.batchId, collect: s.collect }, null, 1));
          console.log(`month to date: ${eur(s.budget.usedEurNanos, 2)} of €${s.budget.capEur} (${(s.budget.ratio * 100).toFixed(1)} %, ${s.budget.level}); month started ${monthStartBucharest(new Date()).toISOString()}`);
          console.log(`review queue: ${before} → ${await queueSize()}${s.batchId ? ' (answers of the batch are applied by the next pass)' : ''}`);
        }
      } finally {
        await c.close();
      }
    }
  }
} finally {
  await pool.end();
}
