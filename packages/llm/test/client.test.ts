import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type BatchItemResult,
  type BatchRowInfo,
  costUsdNanos,
  defaultRoutes,
  LlmBudgetExceededError,
  LlmCallError,
  LlmClient,
  LlmDisabledError,
  MemoryLlmLedger,
  NANOS,
  pairVerifyV1,
  prepare,
  verifyPair,
  worstCaseUsdNanos,
} from '../src';
import { heuristicResponder, MOCK_API_KEY, MockAnthropicServer, pairResponder } from '../src/mock';

const routes = defaultRoutes({ default: 'claude-haiku-5-5', escalation: 'claude-sonnet-5-5' });
const offer = { title: 'Telefon mobil Samsung Galaxy S25, 12GB RAM, 256GB, 5G, Navy', brand: 'Samsung', shop: 'forIT', attributes: { storageGb: 256, ramGb: 12 } };
const product = { title: 'Samsung Galaxy S25 5G Dual SIM 12/256GB Albastru inchis', brand: 'Samsung', attributes: { storageGb: 256 } };

const mock = new MockAnthropicServer(heuristicResponder);
let url = '';
beforeAll(async () => {
  url = await mock.start();
});
afterAll(async () => {
  await mock.stop();
});
beforeEach(() => {
  mock.setResponder(heuristicResponder);
  mock.failures.length = 0;
  mock.pollsUntilEnded = 1;
});

interface Logged {
  level: string;
  obj: object;
  msg?: string;
}

function client(opts: { capEur?: number; ledger?: MemoryLlmLedger; logs?: Logged[] } = {}) {
  const ledger = opts.ledger ?? new MemoryLlmLedger();
  const logs = opts.logs ?? [];
  const llm = new LlmClient({
    apiKey: MOCK_API_KEY,
    baseURL: url,
    ledger,
    capEur: opts.capEur ?? 50,
    eurPerUsd: () => 0.9,
    sleep: async () => undefined,
    log: { info: (obj, msg) => logs.push({ level: 'info', obj, msg }), warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }) },
  });
  return { llm, ledger, logs };
}

const req = (title = offer.title) => prepare(pairVerifyV1, routes.default, { offer: { ...offer, title }, product });

describe('LlmClient: synchronous calls', () => {
  it('needs an API key from the environment (A9) and never falls back to other credentials', () => {
    expect(() => new LlmClient({ apiKey: undefined, ledger: new MemoryLlmLedger(), capEur: 50, eurPerUsd: () => 1 })).toThrow(LlmDisabledError);
    expect(() => new LlmClient({ apiKey: '', ledger: new MemoryLlmLedger(), capEur: 50, eurPerUsd: () => 1 })).toThrow(LlmDisabledError);
  });

  it('verifyPair returns {same, confidence, reason, cost} and bills the ledger at the reported usage', async () => {
    const { llm, ledger } = client();
    mock.setResponder(pairResponder(() => ({ json: { same_product: true, confidence: 0.93, conflicting_attributes: [], reason: 'same S25 12/256' } })));
    const r = await verifyPair(llm, offer, product, routes.default);
    expect(r.same).toBe(true);
    expect(r.confidence).toBe(0.93);
    expect(r.reason).toBe('same S25 12/256');
    const row = ledger.rows[0]!;
    expect(row.status).toBe('billed');
    expect(row.costUsdNanos).toBe(costUsdNanos('claude-haiku-5-5', row.usage!, { batch: false }));
    expect(row.costEurNanos).toBe(Math.ceil(row.costUsdNanos * 0.9));
    expect(r.cost.eur).toBe(row.costEurNanos / NANOS);
    expect(row.costEurNanos).toBeLessThanOrEqual(row.reservedEurNanos);
    expect(row.purpose).toBe('match.verify');
    expect(`${row.promptId}@${row.promptVersion}`).toBe('pair_verify@1');
  });

  it('sends the key only as a credential header and never logs it', async () => {
    const { llm, logs } = client();
    mock.failures.push({ status: 400, type: 'invalid_request_error', message: 'bad' });
    await expect(llm.call(pairVerifyV1, req(), { purpose: 'match.verify' })).rejects.toBeInstanceOf(LlmCallError);
    const last = mock.requests.at(-1)!;
    expect(String(last.headers.authorization ?? last.headers['x-api-key'])).toContain(MOCK_API_KEY);
    expect(last.body).not.toContain(MOCK_API_KEY);
    expect(JSON.stringify(logs)).not.toContain(MOCK_API_KEY);
  });

  it('caches the shared prefix: the second call reads it from the cache', async () => {
    const { llm, ledger } = client();
    await llm.call(pairVerifyV1, req('Telefon Samsung Galaxy S25 Ultra 12GB 512GB'), { purpose: 'match.verify' });
    await llm.call(pairVerifyV1, req('Telefon Samsung Galaxy S25 Ultra 12GB 1TB'), { purpose: 'match.verify' });
    const [a, b] = ledger.rows;
    expect((a!.usage!.cacheWrite1hTokens || 0) + (a!.usage!.cacheReadTokens || 0)).toBeGreaterThan(0);
    expect(b!.usage!.cacheReadTokens).toBeGreaterThan(500);
  });

  it('retries overloaded and rate-limited calls; refused attempts are released, not billed', async () => {
    const { llm, ledger } = client();
    mock.failures.push({ status: 529, type: 'overloaded_error' }, { status: 429, type: 'rate_limit_error', retryAfterSeconds: 1 });
    const r = await llm.call(pairVerifyV1, req(), { purpose: 'match.verify' });
    expect(r.answer.ok).toBe(true);
    expect(ledger.rows.map((x) => x.status)).toEqual(['released', 'released', 'billed']);
  });

  it('a lost connection may have been billed: its reservation stays as the cost', async () => {
    const { llm, ledger } = client();
    mock.failures.push({ drop: true });
    await llm.call(pairVerifyV1, req(), { purpose: 'match.verify' });
    expect(ledger.rows.map((x) => x.status)).toEqual(['estimated', 'billed']);
    expect(ledger.rows[0]!.costEurNanos).toBe(ledger.rows[0]!.reservedEurNanos);
  });

  it('does not retry requests the API rejects', async () => {
    const { llm, ledger } = client();
    mock.failures.push({ status: 401, type: 'authentication_error' });
    await expect(llm.call(pairVerifyV1, req(), { purpose: 'match.verify' })).rejects.toMatchObject({ kind: 'fatal', status: 401 });
    expect(ledger.rows.map((x) => x.status)).toEqual(['released']);
  });

  it('a refusal or an invalid answer is billed and reported as unusable', async () => {
    const { llm, ledger } = client();
    mock.setResponder(() => ({ text: 'Sorry', stopReason: 'refusal' }));
    const r = await llm.call(pairVerifyV1, req(), { purpose: 'match.verify' });
    expect(r.answer).toEqual({ ok: false, error: 'refusal' });
    expect(ledger.rows[0]).toMatchObject({ status: 'billed', error: 'refusal' });
  });
});

describe('LlmClient: monthly cap (hard stop at 100 %)', () => {
  it('stops calls at the cap: nothing is sent once spent + in flight would pass it', async () => {
    const one = worstCaseUsdNanos('claude-haiku-5-5', { maxInputTokens: req().maxInputTokens, maxTokens: req().maxTokens, batch: false });
    // Room for exactly two reservations at €/$ 0.9.
    const capEur = (2.5 * Math.ceil(one * 0.9)) / NANOS;
    const { llm, ledger } = client({ capEur });
    const before = mock.requests.length;
    await llm.call(pairVerifyV1, req('a 1'), { purpose: 'match.verify' });
    await llm.call(pairVerifyV1, req('a 2'), { purpose: 'match.verify' });
    // Billed costs are far below the reservations, so the third call fits again…
    await llm.call(pairVerifyV1, req('a 3'), { purpose: 'match.verify' });
    expect(mock.requests.length - before).toBe(3);
    // …but a cap that is already used up refuses before sending anything.
    const spent = await ledger.monthToDate(new Date(0));
    const full = client({ capEur: spent.spentEurNanos / NANOS, ledger });
    await expect(full.llm.call(pairVerifyV1, req('a 4'), { purpose: 'match.verify' })).rejects.toBeInstanceOf(LlmBudgetExceededError);
    await expect(full.llm.budget.assert()).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(mock.requests.length - before).toBe(3);
  });

  it('parallel calls cannot pass the cap together', async () => {
    const r = req();
    const one = Math.ceil(worstCaseUsdNanos('claude-haiku-5-5', { maxInputTokens: r.maxInputTokens, maxTokens: r.maxTokens, batch: false }) * 0.9);
    const { llm, ledger } = client({ capEur: (3 * one + 1) / NANOS });
    mock.setResponder(async (p, ctx) => {
      await new Promise((res) => setTimeout(res, 30)); // all three stay in flight together
      return heuristicResponder(p, ctx);
    });
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => llm.call(pairVerifyV1, req(`p ${i}`), { purpose: 'match.verify' })));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((x) => x.status === 'rejected' && x.reason instanceof LlmBudgetExceededError)).toHaveLength(2);
    expect(ledger.rows).toHaveLength(3);
  });

  it('a batch takes only the items that fit; the rest is deferred, not sent', async () => {
    const items = [1, 2, 3, 4, 5].map((i) => ({ req: req(`b ${i}`), meta: { purpose: 'match.verify' as const } }));
    const one = Math.ceil(worstCaseUsdNanos('claude-haiku-5-5', { maxInputTokens: items[0]!.req.maxInputTokens + 10, maxTokens: 2048, batch: true }) * 0.9);
    const { llm, ledger } = client({ capEur: (2 * one + one / 2) / NANOS });
    const sub = await llm.submitBatch(items);
    expect(sub.submitted).toHaveLength(2);
    expect(sub.deferred).toHaveLength(3);
    expect(ledger.rows).toHaveLength(2);
    const sent = JSON.parse(mock.requests.at(-1)!.body) as { requests: Array<{ custom_id: string }> };
    expect(sent.requests.map((r) => r.custom_id)).toEqual(sub.submitted.map((s) => `u${s.usageId}`));
  });
});

describe('LlmClient: Message Batches', () => {
  function rowsOf(ledger: MemoryLlmLedger, batchId: string): Map<string, BatchRowInfo> {
    return new Map(
      ledger.rows
        .filter((r) => r.batchId === batchId && r.status === 'reserved')
        .map((r) => [r.customId!, { usageId: r.id, promptId: r.promptId, promptVersion: r.promptVersion, model: r.model, eurPerUsd: r.eurPerUsd }]),
    );
  }

  it('submits items ordered by prefix, then settles each at the batch price when the batch ends', async () => {
    const { llm, ledger } = client();
    mock.pollsUntilEnded = 2;
    const items = [
      { req: prepare(pairVerifyV1, routes.escalation, { offer, product }), meta: { purpose: 'match.verify' as const, subject: { offerId: 1, productId: 2 } } },
      { req: req('Telefon mobil Samsung Galaxy S25, 12GB RAM, 256GB, 5G, Navy'), meta: { purpose: 'match.verify' as const, subject: { offerId: 1, productId: 2 } } },
    ];
    const sub = await llm.submitBatch(items);
    expect(sub.batchId).toMatch(/^msgbatch_/);
    expect(sub.submitted.map((s) => s.req.model)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
    expect(ledger.rows.every((r) => r.status === 'reserved' && r.mode === 'batch' && r.batchId === sub.batchId)).toBe(true);

    const seen: BatchItemResult[] = [];
    expect((await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async (r) => void seen.push(r))).status).toBe('in_progress');
    expect(seen).toHaveLength(0);
    const done = await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async (r) => void seen.push(r));
    expect(done).toEqual({ status: 'ended', processed: 2 });
    expect(seen.every((r) => r.answer.ok && r.billed)).toBe(true);
    for (const row of ledger.rows) {
      expect(row.status).toBe('billed');
      expect(row.costUsdNanos).toBe(costUsdNanos(row.model, row.usage!, { batch: true }));
    }
    // Collecting again changes nothing (idempotent).
    expect((await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async (r) => void seen.push(r))).processed).toBe(0);
  });

  it('errored, expired and canceled items are not billed', async () => {
    const { llm, ledger } = client();
    let n = 0;
    mock.setResponder(() => {
      n++;
      return n === 1 ? { batchResult: 'errored' } : n === 2 ? { batchResult: 'expired' } : { json: { same_product: false, confidence: 0.99, conflicting_attributes: ['edition'], reason: 'x' } };
    });
    mock.pollsUntilEnded = 0;
    const sub = await llm.submitBatch([1, 2, 3].map((i) => ({ req: req(`e ${i}`), meta: { purpose: 'match.verify' as const } })));
    const results: BatchItemResult[] = [];
    await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async (r) => void results.push(r));
    expect(ledger.rows.map((r) => r.status).sort()).toEqual(['billed', 'released', 'released']);
    expect(results.filter((r) => !r.billed).every((r) => !r.answer.ok)).toBe(true);
  });

  it('a canceled batch (kill switch) bills nothing that was not processed', async () => {
    const { llm, ledger } = client();
    mock.pollsUntilEnded = 3;
    const sub = await llm.submitBatch([1, 2].map((i) => ({ req: req(`c ${i}`), meta: { purpose: 'match.verify' as const } })));
    await llm.cancelBatch(sub.batchId!);
    await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async () => undefined);
    await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async () => undefined);
    await llm.collectBatch(sub.batchId!, rowsOf(ledger, sub.batchId!), async () => undefined);
    expect(ledger.rows.map((r) => r.status)).toEqual(['released', 'released']);
  });

  it('a batch create that may have reached the API keeps its reservations; a refused one releases them', async () => {
    const { llm, ledger } = client();
    mock.failures.push({ drop: true });
    await expect(llm.submitBatch([{ req: req('d 1'), meta: { purpose: 'match.verify' } }])).rejects.toMatchObject({ kind: 'ambiguous' });
    mock.failures.push({ status: 413, type: 'request_too_large' });
    await expect(llm.submitBatch([{ req: req('d 2'), meta: { purpose: 'match.verify' } }])).rejects.toMatchObject({ kind: 'fatal' });
    expect(ledger.rows.map((r) => r.status)).toEqual(['estimated', 'released']);
  });
});
