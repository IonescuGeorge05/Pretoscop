/**
 * Attribute extraction for titles missing a hard attribute (M22): offers of phones, laptops, TVs,
 * washing machines… whose title parser found no storage, size or capacity. Prints what the LLM
 * reads in each title next to what is missing; a real run stores the answers (`llm_results`), which
 * matching then uses as an extra conflict check. Offers' own attributes are never overwritten.
 *   pnpm --filter @pretoscop/worker llm:attributes --mock [--limit 10]   local stand-in, nothing written
 *   pnpm --filter @pretoscop/worker llm:attributes [--limit 10]          real (ANTHROPIC_API_KEY + flag llm.matching.enabled)
 */
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool, offersMissingAttributes } from '@pretoscop/db';
import { attributesV1, LlmBudgetExceededError, prepare, type ExtractedAttributes } from '@pretoscop/llm';
import { cliLlm, eur, MOCK_BANNER } from '../llm/cli';
import { storeAnswer } from '../llm/matching';

loadRootEnvFile();
const { values } = parseArgs({ options: { mock: { type: 'boolean' }, limit: { type: 'string' } } });
const env = getEnv();
const log = createLogger('llm-attributes', { level: 'warn' });
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
try {
  const list = await offersMissingAttributes(db, Number(values.limit ?? 10));
  console.log(`${list.length} offers missing a hard attribute`);
  const c = await cliLlm(env, db, log, { mock: !!values.mock });
  if ('error' in c) {
    console.error(c.error);
    process.exitCode = 2;
  } else {
    if (c.mock) console.log(MOCK_BANNER);
    let cost = 0;
    try {
      for (const o of list) {
        const req = prepare(attributesV1, c.settings.routes.default, { title: o.title, category: o.category, brand: o.brand });
        const r = await c.llm.call(attributesV1, req, { purpose: 'attributes.extract', subject: { kind: 'attributes', offerId: o.offerId } });
        cost += r.costEurNanos;
        if (!c.mock) await storeAnswer(db, { kind: 'attributes', offerId: o.offerId }, req, r.answer, r.usageId);
        const a = r.answer.ok ? (r.answer.value as ExtractedAttributes) : null;
        const shown = a ? JSON.stringify({ ...a.attributes, ...(a.isBundle ? { bundle: true } : {}), ...(a.isAccessory ? { accessory: true } : {}), ...(a.isRefurbished ? { refurbished: true } : {}) }) : `unusable: ${!r.answer.ok ? r.answer.error : ''}`;
        console.log(`#${o.offerId} [${o.category}] missing ${o.missing.join(',')}\n   ${o.title.slice(0, 110)}\n   → ${shown}`);
      }
    } catch (e) {
      if (!(e instanceof LlmBudgetExceededError)) throw e;
      console.error(e.message);
    } finally {
      await c.close();
    }
    console.log(`\n${c.mock ? 'mock: nothing written; simulated cost' : 'stored in llm_results; cost'} ${eur(cost)}`);
  }
} finally {
  await pool.end();
}
