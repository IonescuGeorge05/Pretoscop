import { createHash } from 'node:crypto';
import { getEnv } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import {
  llmRecentDecisions,
  matchOffer,
  pendingOffers,
  recordObservation,
  seedDev,
  setFlag,
  sql,
  syncTaxonomy,
  type OfferObservation,
} from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { costUsdNanos, LlmClient, type MessageParams } from '@pretoscop/llm';
import { heuristicResponder, jsonBlocks, MOCK_API_KEY, MockAnthropicServer, promptKindOf, userText, type MockBatchOutcome } from '@pretoscop/llm/mock';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { llmMatchJob } from '../src/jobs/llm';
import { createWorkerLlm, llmSettings } from '../src/llm/factory';
import { PgLlmLedger } from '../src/llm/ledger';
import { runLlmMatching } from '../src/llm/matching';
import type { JobContext } from '../src/jobs/types';

const log = createLogger('test', { level: 'silent' });
const baseEnv = getEnv({});
let t: TestDatabase;
let emag: number;
let dedeman: number;
let n = 0;
const ids: Record<string, number> = {};
const products: Record<string, number> = {};

function obs(shopId: number, externalId: string, title: string, extra: Partial<OfferObservation> = {}): OfferObservation {
  const priceBani = extra.priceBani ?? 150_000;
  return {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId,
    url: `https://x.ro/${externalId}`,
    titleRaw: title,
    titleClean: title,
    priceBani,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    contentHash: createHash('sha256').update(`${externalId}${priceBani}`).digest('hex'),
    observedAt: new Date(Date.now() - 3600_000 + n++ * 1000),
    ...extra,
  };
}

async function record(shopId: number, key: string, title: string, extra: Partial<OfferObservation> = {}): Promise<string> {
  const r = await recordObservation(t.db, obs(shopId, key, title, extra));
  ids[key] = r.offerId!;
  const [o] = await pendingOffers(t.db, 1, { offerIds: [r.offerId!] });
  return (await matchOffer(t.db, o!)).decision;
}

async function offerState(key: string) {
  const r = await t.db.execute<{ product_id: string | null; match_status: string }>(sql`SELECT product_id::text, match_status FROM offers WHERE id = ${ids[key]!}`);
  return r.rows[0]!;
}

async function lastDecision(key: string) {
  const r = await t.db.execute<{ decision: string; decided_by: string; product_id: string | null }>(sql`SELECT decision, decided_by, product_id::text FROM match_decisions WHERE offer_id = ${ids[key]!} ORDER BY id DESC LIMIT 1`);
  return r.rows[0]!;
}

async function reviewQueueSize(): Promise<number> {
  const r = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM offers WHERE match_status = 'pending' AND matched_at IS NOT NULL AND active`);
  return Number(r.rows[0]!.n);
}

/** Scripted answers: per offer title and model (the mock knows nothing about products). */
const SCRIPT: Record<string, Partial<Record<'claude-haiku-5-5' | 'claude-sonnet-5-5', { same_product: boolean; confidence: number }>>> = {
  'Telefon Samsung Galaxy A56 256GB negru': { 'claude-haiku-5-5': { same_product: true, confidence: 0.95 } },
  'Telefon Xiaomi Redmi Note 14 Pro 256GB albastru': { 'claude-haiku-5-5': { same_product: false, confidence: 0.96 } },
  'Telefon Xiaomi Redmi Note 14 Pro 5G 256GB negru': { 'claude-haiku-5-5': { same_product: true, confidence: 0.8 }, 'claude-sonnet-5-5': { same_product: true, confidence: 0.95 } },
  'Telefon Apple iPhone 16 Pro 256GB Black Titanium': { 'claude-sonnet-5-5': { same_product: true, confidence: 0.97 } },
  'Telefon Motorola Moto G85 5G albastru': { 'claude-haiku-5-5': { same_product: true, confidence: 0.95 } },
};

function scripted(p: MessageParams): MockBatchOutcome {
  const kind = promptKindOf(p);
  const [first] = jsonBlocks(userText(p));
  if (kind === 'attributes') {
    // The extractor "reads" 128 GB in the Motorola title (the product is the 256 GB variant).
    return { json: { storage_gb: 128, ram_gb: null, screen_inches: null, color: 'blue', capacity_kg: null, capacity_l: null, network: '5g', edition: [], is_bundle: false, is_accessory: false, is_refurbished: false } };
  }
  if (kind !== 'pair_verify') return { text: 'unexpected prompt' };
  const a = SCRIPT[String(first?.title)]?.[p.model as 'claude-haiku-5-5'];
  if (!a) return { json: { same_product: false, confidence: 0.5, conflicting_attributes: [], reason: 'no script' } };
  return { json: { ...a, conflicting_attributes: [], reason: `scripted ${p.model}` } };
}

const mock = new MockAnthropicServer((p) => scripted(p));
let llm: LlmClient;
const settings = llmSettings(baseEnv);

beforeAll(async () => {
  await mock.start();
  t = await createTestDatabase();
  await seedDev(t.db);
  await syncTaxonomy(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  emag = Number(r.rows.find((x) => x.slug === 'emag')!.id);
  dedeman = Number(r.rows.find((x) => x.slug === 'dedeman')!.id);
  await t.db.execute(sql`UPDATE shops SET trust_tier = 1 WHERE id = ${emag}`);
  await t.db.execute(sql`UPDATE shops SET trust_tier = 2 WHERE id = ${dedeman}`);
  llm = new LlmClient({ apiKey: MOCK_API_KEY, baseURL: mock.url, ledger: new PgLlmLedger(t.db), capEur: 50, eurPerUsd: () => 0.92, log });

  // Catalogue products (a trusted shop's offers).
  for (const [key, title, extra] of [
    ['P-A56', 'Telefon mobil Samsung Galaxy A56 5G, 8GB RAM, 256GB, Negru', { brandName: 'Samsung', mpnNorm: 'SMA566BZKAEUE', attributes: { storageGb: 256, ramGb: 8, color: 'black' } }],
    ['P-RN14', 'Telefon mobil Xiaomi Redmi Note 14 Pro 5G, 8GB RAM, 256GB, Negru', { brandName: 'Xiaomi', attributes: { storageGb: 256, ramGb: 8 } }],
    ['P-IP16', 'Telefon mobil Apple iPhone 16 Pro, 256GB, 5G, Black Titanium', { brandName: 'Apple', mpnNorm: 'MYNH3', attributes: { storageGb: 256 }, priceBani: 599_900, totalBani: 599_900 }],
    ['P-G85', 'Telefon mobil Motorola Moto G85 5G, 12GB RAM, 256GB, Albastru', { brandName: 'Motorola', attributes: { storageGb: 256, ramGb: 12, color: 'blue' } }],
  ] as const) {
    expect(await record(emag, key, title, extra as Partial<OfferObservation>)).toBe('new_product');
    products[key] = Number((await offerState(key)).product_id);
  }
  await t.db.execute(sql`UPDATE products SET min_total_price = 5999.00 WHERE id = ${products['P-IP16']!}`);
  await t.db.execute(sql`INSERT INTO product_specs (product_id, source, locale, data, attribution) VALUES (${products['P-A56']!}, 'icecat', 'ro', ${JSON.stringify({ Greutate: 'ICECAT-SENTINEL-195g' })}::jsonb, 'Icecat')`);

  // Review-queue items from a shop whose titles alone never decide.
  for (const [key, title, extra] of [
    ['G1', 'Telefon Samsung Galaxy A56 256GB negru', { brandName: 'Samsung', attributes: { storageGb: 256, color: 'black' }, sellerType: 'marketplace', sellerName: 'Ion Popescu PFA' }],
    ['G2', 'Telefon Xiaomi Redmi Note 14 Pro 256GB albastru', { brandName: 'Xiaomi', attributes: { storageGb: 256 } }],
    ['G3', 'Telefon Xiaomi Redmi Note 14 Pro 5G 256GB negru', { brandName: 'Xiaomi', attributes: { storageGb: 256 } }],
    ['G4', 'Telefon Apple iPhone 16 Pro 256GB Black Titanium', { brandName: 'Apple', attributes: { storageGb: 256 }, priceBani: 580_000, totalBani: 580_000 }],
    ['G5', 'Telefon Motorola Moto G85 5G albastru', { brandName: 'Motorola', attributes: { color: 'blue' } }],
  ] as const) {
    expect(await record(dedeman, key, title, extra as Partial<OfferObservation>)).toBe('needs_review');
  }
});

afterAll(async () => {
  await mock.stop();
  await t?.drop();
});

describe('LLM matching of the gray zone (M22)', () => {
  it('submits one batch, ordered by prompt prefix, without seller names or Icecat data', async () => {
    expect(await reviewQueueSize()).toBe(5);
    mock.pollsUntilEnded = 1;
    const s = await runLlmMatching({ db: t.db, llm, log, settings }, { limit: 100, mode: 'batch' });
    expect(s.offers).toBe(5);
    expect(s.batchId).toMatch(/^msgbatch_/);
    // G1, G2, G3, G5 ask Haiku; G4 (high value) asks Sonnet; G5 also needs attribute extraction.
    expect(s.submitted).toBe(6);
    expect(s.decided.accept + s.decided.reject).toBe(0);
    const batch = JSON.parse(mock.requests.find((r) => r.path === '/v1/messages/batches')!.body) as { requests: Array<{ params: MessageParams }> };
    const keys = batch.requests.map((r) => `${r.params.model}|${promptKindOf(r.params)}`);
    expect(keys).toEqual([...keys].sort());
    for (const r of batch.requests) expect(r.params.system).toMatchObject([{ cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    const wire = mock.sentBodies();
    expect(wire).not.toContain('Ion Popescu');
    expect(wire).not.toContain('ICECAT-SENTINEL');
    expect(wire).toContain('Dedeman');
    const rows = await t.db.execute<{ status: string; n: string }>(sql`SELECT status, count(*)::text AS n FROM llm_usage GROUP BY status`);
    expect(rows.rows).toEqual([{ status: 'reserved', n: '6' }]);
  });

  it('a second pass while the batch is in flight sends nothing again', async () => {
    mock.pollsUntilEnded = 100;
    const before = mock.requests.filter((r) => r.path === '/v1/messages/batches').length;
    const s = await runLlmMatching({ db: t.db, llm, log, settings }, { limit: 100, mode: 'batch' });
    expect(s.submitted).toBe(0);
    expect(mock.requests.filter((r) => r.path === '/v1/messages/batches').length).toBe(before);
  });

  it('collects the answers, decides, escalates the unsure pair, and keeps conflicts for a human', async () => {
    await mock.endAll();
    const s = await runLlmMatching({ db: t.db, llm, log, settings }, { limit: 100, mode: 'batch' });
    expect(s.collect.results).toBe(6);
    expect(s.decided).toMatchObject({ accept: 2, reject: 1 }); // G1 (Haiku), G4 (Sonnet); G2 rejected
    expect(s.submitted).toBe(1); // G3 escalated to Sonnet
    expect(await offerState('G1')).toEqual({ product_id: String(products['P-A56']), match_status: 'auto' });
    expect(await lastDecision('G1')).toEqual({ decision: 'accept', decided_by: 'llm:claude-haiku-5-5', product_id: String(products['P-A56']) });
    expect(await lastDecision('G4')).toMatchObject({ decision: 'accept', decided_by: 'llm:claude-sonnet-5-5' });
    expect(await offerState('G2')).toEqual({ product_id: null, match_status: 'unmatched' });
    expect(await lastDecision('G2')).toMatchObject({ decision: 'reject', decided_by: 'llm:claude-haiku-5-5' });
    // G5: the pair answer says "same", but the extracted 128 GB conflicts with the product's 256 GB.
    expect(await offerState('G5')).toEqual({ product_id: null, match_status: 'pending' });

    await mock.endAll();
    const s2 = await runLlmMatching({ db: t.db, llm, log, settings }, { limit: 100, mode: 'batch' });
    expect(s2.decided.accept).toBe(1);
    expect(await lastDecision('G3')).toMatchObject({ decision: 'accept', decided_by: 'llm:claude-sonnet-5-5' });
    // Review queue before/after: 5 → 1 (G5 stays with a human).
    expect(await reviewQueueSize()).toBe(1);
    // Nothing left to ask: answers are stored and requests are never repeated.
    const s3 = await runLlmMatching({ db: t.db, llm, log, settings }, { limit: 100, mode: 'batch' });
    expect(s3.submitted).toBe(0);
  });

  it('bills every request of the ledger at the batch price', async () => {
    const r = await t.db.execute<{ status: string; model: string; cost_usd_nanos: string; input_tokens: number; output_tokens: number; cache_write_1h_tokens: number; cache_read_tokens: number; purpose: string }>(sql`
      SELECT status, model, cost_usd_nanos::text, input_tokens, output_tokens, cache_write_1h_tokens, cache_read_tokens, purpose FROM llm_usage ORDER BY id`);
    expect(r.rows).toHaveLength(7);
    for (const row of r.rows) {
      expect(row.status).toBe('billed');
      const usage = { inputTokens: row.input_tokens, outputTokens: row.output_tokens, cacheWrite5mTokens: 0, cacheWrite1hTokens: row.cache_write_1h_tokens, cacheReadTokens: row.cache_read_tokens };
      expect(Number(row.cost_usd_nanos)).toBe(costUsdNanos(row.model, usage, { batch: true }));
    }
    expect(r.rows.filter((x) => x.model === 'claude-sonnet-5-5')).toHaveLength(2);
    expect(r.rows.filter((x) => x.purpose === 'attributes.extract')).toHaveLength(1);
    // The admin sample: LLM accepts and rejects are listed.
    const decisions = await llmRecentDecisions(t.db);
    expect(decisions.filter((d) => d.decision === 'accept')).toHaveLength(3);
    expect(decisions.filter((d) => d.decision === 'reject')).toHaveLength(1);
  });

  it('stops at the monthly cap: nothing is sent and the item stays in the queue', async () => {
    expect(await record(dedeman, 'G6', 'Telefon Samsung Galaxy A56 256GB', { brandName: 'Samsung', attributes: { storageGb: 256 } })).toBe('needs_review');
    const spent = await t.db.execute<{ n: string }>(sql`SELECT coalesce(sum(cost_eur_nanos), 0)::text AS n FROM llm_usage`);
    const capped = new LlmClient({ apiKey: MOCK_API_KEY, baseURL: mock.url, ledger: new PgLlmLedger(t.db), capEur: Number(spent.rows[0]!.n) / 1e9, eurPerUsd: () => 0.92, log });
    const before = mock.requests.length;
    const s = await runLlmMatching({ db: t.db, llm: capped, log, settings }, { limit: 100, mode: 'batch' });
    expect(s.stoppedByCap).toBe(true);
    expect(s.submitted).toBe(0);
    expect(s.deferred).toBeGreaterThan(0);
    expect(s.budget.level).toBe('stop');
    expect(mock.requests.length).toBe(before);
    expect((await offerState('G6')).match_status).toBe('pending');
  });

  it('the job runs only with the flag; switching it off cancels batches in flight and decides nothing', async () => {
    const env = { ...baseEnv, ANTHROPIC_API_KEY: MOCK_API_KEY, ANTHROPIC_BASE_URL: mock.url };
    const sent: unknown[] = [];
    const ctx = { db: t.db, env, log, boss: { send: async (_q: string, d: unknown) => void sent.push(d) } } as unknown as JobContext;
    const job = { data: {} } as Parameters<typeof llmMatchJob.handler>[0];
    await setFlag(t.db, 'llm.matching.enabled', false);
    expect(await llmMatchJob.handler(job, ctx)).toEqual({ skipped: 'flag llm.matching.enabled is off' });

    await setFlag(t.db, 'llm.matching.enabled', true);
    mock.pollsUntilEnded = 100;
    const on = (await llmMatchJob.handler(job, ctx)) as { submitted: number; batchId: string };
    expect(on.submitted).toBeGreaterThan(0);

    await setFlag(t.db, 'llm.matching.enabled', false);
    const off = (await llmMatchJob.handler(job, ctx)) as { canceled: number };
    expect(off.canceled).toBe(1);
    // The cancel ends the batch at the next poll: canceled requests are released, not billed.
    mock.pollsUntilEnded = 0;
    await llmMatchJob.handler(job, ctx);
    const rows = await t.db.execute<{ status: string }>(sql`SELECT status FROM llm_usage WHERE batch_id = ${on.batchId}`);
    expect(rows.rows.every((r) => r.status === 'released')).toBe(true);
    expect((await offerState('G6')).match_status).toBe('pending');
    expect(sent).toEqual([]);
  });

  it('without an API key nothing is created or sent', () => {
    const { llm: none, reason } = createWorkerLlm({ ...baseEnv, ANTHROPIC_API_KEY: undefined }, t.db, log);
    expect(none).toBeNull();
    expect(reason).toContain('A9');
  });

  it('the heuristic stand-in answers every prompt kind (mock runs only)', async () => {
    mock.setResponder(heuristicResponder);
    // Smoke: a sync pass on the remaining item works end to end with the stand-in.
    const s = await runLlmMatching({ db: t.db, llm, log, settings }, { limit: 10, mode: 'sync' });
    expect(s.offers).toBeGreaterThanOrEqual(1);
    expect(s.submitted).toBeGreaterThanOrEqual(1);
  });
});
