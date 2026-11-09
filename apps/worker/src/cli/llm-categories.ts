/**
 * Category mapping suggestions for shop categories we cannot place (M22): each shop breadcrumb whose
 * offers have no category, with five sample titles, gets a suggested category of our taxonomy.
 * Suggestions are for the founders: applying one means adding the breadcrumb to the category's
 * `crumbs` rules in packages/core/src/taxonomy.ts (reviewed like any code change).
 *   pnpm --filter @pretoscop/worker llm:categories --mock [--limit 20]   local stand-in, nothing written
 *   pnpm --filter @pretoscop/worker llm:categories [--limit 20]          real (ANTHROPIC_API_KEY + flag llm.matching.enabled)
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, unmappedShopCategories } from '@pretoscop/db';
import { categoryV1, type CategorySuggestion, LlmBudgetExceededError, prepare } from '@pretoscop/llm';
import { cliLlm, eur, MOCK_BANNER } from '../llm/cli';
import { storeAnswer } from '../llm/matching';

loadRootEnvFile();
const { values } = parseArgs({ options: { mock: { type: 'boolean' }, limit: { type: 'string' } } });
const env = getEnv();
const log = createLogger('llm-categories', { level: 'warn' });
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const groups = await unmappedShopCategories(db, Number(values.limit ?? 20));
  console.log(`${groups.length} shop categories without a mapping`);
  const c = await cliLlm(env, db, log, { mock: !!values.mock });
  if ('error' in c) {
    console.error(c.error);
    process.exitCode = 2;
  } else {
    if (c.mock) console.log(MOCK_BANNER);
    let cost = 0;
    try {
      for (const g of groups) {
        const req = prepare(categoryV1, c.settings.routes.default, { shop: g.shopName, path: g.path, titles: g.titles });
        const r = await c.llm.call(categoryV1, req, { purpose: 'category.suggest', subject: { kind: 'category', key: `${g.shopSlug}|${g.path}` } });
        cost += r.costEurNanos;
        if (!c.mock) await storeAnswer(db, { kind: 'category', key: `${g.shopSlug}|${g.path}` }, req, r.answer, r.usageId);
        const s = r.answer.ok ? (r.answer.value as CategorySuggestion) : null;
        console.log(`${g.shopSlug.padEnd(10)} ${String(g.offers).padStart(4)} offers  ${g.path.slice(0, 70)}\n   → ${s ? `${s.slug ?? '(none)'} ${s.confidence.toFixed(2)}: ${s.reason}` : `unusable: ${!r.answer.ok ? r.answer.error : ''}`}`);
      }
    } catch (e) {
      if (!(e instanceof LlmBudgetExceededError)) throw e;
      console.error(e.message);
    } finally {
      await c.close();
    }
    console.log(`\n${c.mock ? 'mock: nothing written; simulated cost' : 'stored in llm_results (kind category); cost'} ${eur(cost)}`);
  }
} finally {
  await pool.end();
}
