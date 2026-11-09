/**
 * Matching eval with LLM verification (M22): the labelled pairs of M07 (packages/core/src/matching-eval/*.json)
 * that the rules leave to a human are asked of the LLM; precision, recall and the share of the
 * review queue the LLM decides are reported at several confidence thresholds, with the cost per
 * 1,000 pairs from the ledger and the price table. One command once the key exists (A9):
 *
 *   pnpm --filter @pretoscop/worker match:eval:llm                    real run: one Message Batch, waits for it (Haiku 5.5)
 *   pnpm --filter @pretoscop/worker match:eval:llm --model escalation the same with Sonnet 5.5
 *   pnpm --filter @pretoscop/worker match:eval:llm --mock             pipeline check against a local stand-in (NOT a measurement)
 *   options: --sync (calls instead of a batch), --scope all (every pair without a rule conflict: the LLM alone),
 *            --mask (GTIN/MPN hidden: the LLM judges titles and attributes, the production gray zone),
 *            --threshold 0.9, --thresholds 0.8,0.85,0.9,0.95,0.98, --limit N, --answers <file.json> (re-score saved answers,
 *            no call), --resume <batchId> (collect a batch an interrupted run left), --show (false accepts)
 *
 * Every run saves its answers and a Markdown report under data/reports/. Exit code: 0 pass, 1 fail
 * (precision below 98 % at the threshold on real labels, or an accept across variants of one model),
 * 3 inconclusive (fewer than 50 real-labelled pairs reached the LLM: the founders' 100 labels are
 * needed, `pnpm --filter @pretoscop/worker match:label`). A mock run always exits 0.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { type EvalPair, evaluateWithLlm, type LlmEvalAnswer, type LlmThresholdReport, maskIdentifiers, type MatchSide, pairsToAsk } from '@pretoscop/core';
import { createDb, createPool, llmBatchRows } from '@pretoscop/db';
import { type BatchRowInfo, estimateCost, MemoryLlmLedger, NANOS, pairVerifyV1, type PairVerdict, type ParsedAnswer, prepare, type PreparedRequest, PRICES_AS_OF, type RawSide, usdToEurNanos } from '@pretoscop/llm';
import { cliLlm, eur, MOCK_BANNER } from '../llm/cli';
import { eurPerUsdFrom } from '../llm/factory';
import { loadPairs } from './eval-data';

loadRootEnvFile();
const { values } = parseArgs({
  options: {
    mock: { type: 'boolean' },
    mask: { type: 'boolean' },
    sync: { type: 'boolean' },
    scope: { type: 'string' },
    model: { type: 'string' },
    threshold: { type: 'string' },
    thresholds: { type: 'string' },
    limit: { type: 'string' },
    answers: { type: 'string' },
    resume: { type: 'string' },
    show: { type: 'boolean' },
    'poll-seconds': { type: 'string' },
  },
});
const env = getEnv();
const log = createLogger('match-eval-llm', { level: 'warn' });
const scope = values.scope === 'all' ? 'all' : 'gray';
const chosen = Number(values.threshold ?? env.LLM_ACCEPT_CONFIDENCE);
const thresholds = [...new Set([...(values.thresholds ?? '0.8,0.85,0.9,0.95,0.98').split(',').map(Number), chosen])].filter((x) => x > 0 && x <= 1).sort();
const REPORTS = join(process.cwd(), '../../data/reports');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

function side(s: MatchSide): RawSide {
  return { title: s.title, brand: s.brand, mpn: s.mpnNorm, gtin: s.gtin14, category: s.category, attributes: s.attributes };
}

// --mask hides GTINs and MPNs: the realistic gray zone (no identifier agreement), where real labels
// (two shops agreeing on a field MPN; variants of one model) reach the LLM without waiting for humans.
const pairs = values.mask ? loadPairs().map(maskIdentifiers) : loadPairs();
const asked = pairsToAsk(pairs, scope).slice(0, values.limit ? Number(values.limit) : undefined);
const real = (p: EvalPair) => p.source !== 'synthetic';
console.log(`${pairs.length} labelled pairs; ${asked.length} go to the LLM (scope ${scope}): ${asked.filter(real).length} with real labels, ${asked.filter((p) => !real(p)).length} synthetic`);

const pool = createPool(env.DATABASE_URL, 3);
const db = createDb(pool);
const answers = new Map<string, LlmEvalAnswer | null>();
let mock = false;
let costEurNanos = 0;
let costUsdNanos = 0;
let billed = 0;
let cacheRead = 0;
let promptTokens = 0;
let modelUsed = '';
let estimate: { eurNanos: number; requests: number } | null = null;

try {
  if (values.answers) {
    const saved = JSON.parse(readFileSync(values.answers, 'utf8')) as { model: string; answers: Record<string, LlmEvalAnswer | null> };
    for (const [k, v] of Object.entries(saved.answers)) answers.set(k, v);
    modelUsed = saved.model;
    console.log(`re-scoring ${answers.size} saved answers from ${values.answers} (no call)`);
  } else {
    const c = await cliLlm(env, db, log, { mock: !!values.mock });
    if ('error' in c) {
      console.error(c.error);
      process.exitCode = 2;
      throw new Error('stop');
    }
    mock = c.mock;
    if (mock) console.log(MOCK_BANNER);
    try {
      const route = values.model === 'escalation' ? c.settings.routes.escalation : c.settings.routes.default;
      modelUsed = route.model;
      const byHash = new Map<string, { req: PreparedRequest; ids: string[] }>();
      for (const p of asked) {
        const req = prepare(pairVerifyV1, route, { offer: side(p.offer), product: side(p.product) });
        const e = byHash.get(req.inputHash) ?? { req, ids: [] };
        e.ids.push(p.id);
        byHash.set(req.inputHash, e);
      }
      const rate = await eurPerUsdFrom(db, env, log)();
      const est = estimateCost([...byHash.values()].map((x) => x.req), { batch: !values.sync });
      estimate = { eurNanos: usdToEurNanos(est.usdNanos, rate), requests: est.requests };
      const record = (hash: string, a: ParsedAnswer<unknown>) => {
        const v = a.ok ? (a.value as PairVerdict) : null;
        for (const id of byHash.get(hash)?.ids ?? []) answers.set(id, v ? { same: v.same, confidence: v.confidence, conflictingAttributes: v.conflictingAttributes } : null);
      };
      const account = (r: { costEurNanos: number; costUsdNanos: number; usage: { cacheReadTokens: number; inputTokens: number; cacheWrite1hTokens: number; cacheWrite5mTokens: number } }) => {
        costEurNanos += r.costEurNanos;
        costUsdNanos += r.costUsdNanos;
        billed++;
        cacheRead += r.usage.cacheReadTokens;
        promptTokens += r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWrite1hTokens + r.usage.cacheWrite5mTokens;
      };
      if (values.sync) {
        for (const { req } of byHash.values()) {
          const r = await c.llm.call(pairVerifyV1, req, { purpose: 'eval', subject: { kind: 'eval' } });
          record(req.inputHash, r.answer);
          account(r);
        }
      } else {
        let batchId = values.resume ?? null;
        let rows: Map<string, BatchRowInfo>;
        const hashOf = new Map<string, string>();
        if (batchId) {
          const r = await llmBatchRows(db, batchId);
          rows = new Map(r.map((x) => [x.customId, { usageId: x.usageId, promptId: x.promptId, promptVersion: x.promptVersion, model: x.model, eurPerUsd: x.eurPerUsd }]));
          for (const x of r) hashOf.set(x.customId, x.inputHash);
        } else {
          const sub = await c.llm.submitBatch([...byHash.values()].map(({ req }) => ({ req, meta: { purpose: 'eval' as const, subject: { kind: 'eval' } } })));
          if (sub.deferred.length) console.warn(`monthly cap: ${sub.deferred.length} of ${byHash.size} requests not sent`);
          if (!sub.batchId) throw new Error('nothing sent (monthly cap reached)');
          batchId = sub.batchId;
          rows = new Map(sub.submitted.map((s) => [`u${s.usageId}`, { usageId: s.usageId, promptId: s.req.promptId, promptVersion: s.req.promptVersion, model: s.req.model, eurPerUsd: rate }]));
          for (const s of sub.submitted) hashOf.set(`u${s.usageId}`, s.req.inputHash);
          // The memory ledger keeps the reservation's rate; the PostgreSQL one stores it on the row.
          if (!c.mock) {
            const stored = await llmBatchRows(db, batchId);
            for (const x of stored) rows.set(x.customId, { usageId: x.usageId, promptId: x.promptId, promptVersion: x.promptVersion, model: x.model, eurPerUsd: x.eurPerUsd });
          }
          console.log(`batch ${batchId}: ${sub.submitted.length} requests (resume with --resume ${batchId} if interrupted)`);
        }
        const wait = Number(values['poll-seconds'] ?? (c.mock ? 0.2 : 30)) * 1000;
        for (;;) {
          const out = await c.llm.collectBatch(batchId, rows, async (res) => {
            const hash = hashOf.get(res.customId);
            if (hash) record(hash, res.answer);
            if (res.billed) account(res);
          });
          if (out.status === 'ended' || out.status === 'missing') break;
          process.stdout.write(`batch ${out.status}…\r`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      if (c.ledger instanceof MemoryLlmLedger) {
        // Mock: the memory ledger holds the run; its sums equal what was accounted above.
        const sum = c.ledger.rows.reduce((s, r) => s + (r.status === 'billed' ? r.costEurNanos : r.status === 'estimated' ? r.reservedEurNanos : 0), 0);
        if (sum !== costEurNanos) console.warn(`ledger ${eur(sum)} ≠ accounted ${eur(costEurNanos)}`);
      }
    } finally {
      await c.close();
    }
  }

  const reports = evaluateWithLlm(pairs, answers, { thresholds, scope });
  const realReports = evaluateWithLlm(pairs.filter(real), answers, { thresholds, scope });
  const lines: string[] = [];
  const out = (s = '') => {
    lines.push(s);
    console.log(s);
  };
  out(`\n# LLM matching eval — ${new Date().toISOString().slice(0, 16)} UTC${mock ? ' — MOCK (not a measurement)' : ''}`);
  out(`model ${modelUsed || '?'}, prompt ${pairVerifyV1.id}@${pairVerifyV1.version}, scope ${scope}${values.mask ? ', identifiers masked' : ''}, prices as of ${PRICES_AS_OF}`);
  out('\n## All labelled pairs (rules + LLM)');
  out('threshold  accepts  precision  recall  review   | LLM: asked  accepts  acc.prec  rejects  rej.prec  decided  unanswered');
  for (const r of reports) row(r);
  out('\n## Real labels only (human, gtin, mpn, family): the acceptance set');
  for (const r of realReports) row(r);
  const at = realReports.find((r) => r.threshold === chosen)!;
  out(`\nby source at ${chosen}: ${Object.entries(reports.find((r) => r.threshold === chosen)!.bySource).map(([s, st]) => `${s} ${st.accepts}/${st.pairs} precision ${pct(st.precision).trim()}`).join('; ')}`);
  if (values.show) for (const id of at.gray.falseAccepts) out(`  FALSE ACCEPT ${id}`);

  out('\n## Cost');
  const pairsAnswered = [...answers.values()].filter((a) => a !== null).length;
  if (billed > 0) {
    out(`${billed} billed requests: ${eur(costEurNanos)} ($${(costUsdNanos / NANOS).toFixed(4)})${mock ? ' — simulated usage' : ''}`);
    out(`cost per 1,000 pairs (ledger): ${eur(Math.round((costEurNanos / Math.max(1, asked.length)) * 1000), 3)}; prompt tokens read from the cache: ${promptTokens ? pct(cacheRead / promptTokens).trim() : '—'}`);
  }
  if (estimate) out(`cost per 1,000 pairs (price table, est. tokens, ${values.sync ? 'sync' : 'batch'}): ${eur(Math.round((estimate.eurNanos / Math.max(1, estimate.requests)) * 1000), 3)}`);

  const realAsked = asked.filter(real).length;
  const failures: string[] = [];
  if (at.combined.precision < 0.98) failures.push(`precision on real labels ${pct(at.combined.precision).trim()} < 98 % at ${chosen}`);
  if ((at.bySource.family?.falseAccepts.length ?? 0) > 0) failures.push(`${at.bySource.family!.falseAccepts.length} accepts across variants of one model`);
  const verdict = mock ? 'MOCK (no verdict)' : failures.length ? `FAIL: ${failures.join('; ')}` : realAsked < 50 ? `INCONCLUSIVE: only ${realAsked} real-labelled pairs reached the LLM (label 100 pairs: pnpm --filter @pretoscop/worker match:label)` : 'PASS';
  out(`\n## Verdict at threshold ${chosen}: ${verdict}`);
  out(`LLM accepts on real labels: ${at.gray.llmAccepts} (${at.gray.llmCorrectAccepts} correct, precision ${pct(at.gray.llmAcceptPrecision).trim()}); answered ${pairsAnswered} of ${asked.length}`);

  mkdirSync(REPORTS, { recursive: true });
  const base = join(REPORTS, `llm-eval-${stamp}${mock ? '-MOCK' : ''}`);
  writeFileSync(`${base}.json`, `${JSON.stringify({ model: modelUsed, prompt: `${pairVerifyV1.id}@${pairVerifyV1.version}`, scope, masked: !!values.mask, mock, answers: Object.fromEntries(answers) }, null, 1)}\n`);
  writeFileSync(`${base}.md`, `${lines.join('\n')}\n`);
  console.log(`\nanswers: ${base}.json\nreport:  ${base}.md`);
  if (!mock) process.exitCode = failures.length ? 1 : realAsked < 50 ? 3 : 0;

  function row(r: LlmThresholdReport) {
    const g = r.gray;
    out(
      `${r.threshold.toFixed(2).padStart(9)}  ${String(r.combined.accepts).padStart(7)}  ${pct(r.combined.precision).padStart(9)}  ${pct(r.combined.recall)}  ${pct(r.combined.reviewRate)}   | ${String(g.asked).padStart(10)}  ${String(g.llmAccepts).padStart(7)}  ${pct(g.llmAcceptPrecision).padStart(8)}  ${String(g.llmRejects).padStart(7)}  ${pct(g.llmRejectPrecision).padStart(8)}  ${pct(g.decidedShare).padStart(7)}  ${String(g.unanswered).padStart(10)}`,
    );
  }
} catch (e) {
  if ((e as Error).message !== 'stop') throw e;
} finally {
  await pool.end();
}
