/**
 * LLM spend this month (M22): the cap, what is billed and reserved, by purpose and model, batches in
 * flight, the cache hit share and the cost per 1,000 pair verifications.
 *   pnpm --filter @pretoscop/worker llm:spend
 */
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool, llmInFlightBatches, llmSpendSummary, sql } from '@pretoscop/db';
import { budgetStatusOf, monthStartBucharest, PRICES_AS_OF } from '@pretoscop/llm';
import { eur } from '../llm/cli';

loadRootEnvFile();
const env = getEnv();
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const monthStart = monthStartBucharest(new Date());
  const s = await llmSpendSummary(db, monthStart);
  const b = budgetStatusOf(s, env.LLM_MONTHLY_CAP_EUR, monthStart);
  console.log(`month from ${monthStart.toISOString()} (Europe/Bucharest); prices as of ${PRICES_AS_OF}; key ${env.ANTHROPIC_API_KEY ? 'set' : 'NOT set (A9)'}`);
  console.log(`cap €${env.LLM_MONTHLY_CAP_EUR.toFixed(2)}: billed ${eur(s.spentEurNanos)} + in flight ${eur(s.reservedEurNanos)} = ${(b.ratio * 100).toFixed(1)} % (${b.level}${b.level === 'warn' ? ': above 80 %' : b.level === 'stop' ? ': every call stopped' : ''})`);
  console.log(`${s.calls} requests (${s.billedCalls} billed); ${s.inFlightBatches} batches in flight (${s.inFlightItems} requests); prompt tokens read from the cache: ${(s.cacheReadShare * 100).toFixed(1)} %`);
  for (const p of s.byPurpose) console.log(`  ${p.purpose.padEnd(20)} ${p.model.padEnd(18)} ${String(p.calls).padStart(6)} requests  ${eur(p.eurNanos)}`);
  const v = await db.execute<{ n: string; eur: string }>(sql`
    SELECT count(*)::text AS n, coalesce(sum(cost_eur_nanos), 0)::text AS eur FROM llm_usage
    WHERE purpose = 'match.verify' AND status = 'billed' AND created_at >= ${monthStart.toISOString()}::timestamptz`);
  const n = Number(v.rows[0]?.n ?? 0);
  if (n > 0) console.log(`cost per 1,000 pair verifications this month: ${eur(Math.round((Number(v.rows[0]!.eur) / n) * 1000), 3)}`);
  console.log(`LLM decisions this month: ${s.decisions.accept} accepts, ${s.decisions.reject} rejects`);
  for (const x of await llmInFlightBatches(db)) console.log(`  batch ${x.batchId}: ${x.items} requests since ${x.createdAt}`);
} finally {
  await pool.end();
}
