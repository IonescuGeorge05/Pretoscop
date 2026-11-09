import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyLlmAccept,
  applyLlmReject,
  decideManually,
  latestEurPerUsd,
  llmAttachBatch,
  llmBatchRows,
  llmEstimate,
  llmGrayZoneOffers,
  llmInFlightBatches,
  llmInFlightHashes,
  llmMonthToDate,
  llmOpinions,
  llmRecentDecisions,
  llmRelease,
  llmReserve,
  llmResultsByHash,
  llmSettle,
  llmSpendSummary,
  llmStoreResult,
  llmSweepStaleReservations,
  matchOffer,
  pendingOffers,
  recordObservation,
  revertLlmDecision,
  seedDev,
  syncTaxonomy,
  type LlmReservationRow,
  type OfferObservation,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let emag: number;
let dedeman: number;
let n = 0;
const NANO = 1_000_000_000;
const monthStart = new Date(Date.now() - 86_400_000); // "this month" for the ledger tests

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

const entry = (eur: number, extra: Partial<LlmReservationRow> = {}): LlmReservationRow => ({
  purpose: 'match.verify',
  model: 'claude-haiku-5-5',
  promptId: 'pair_verify',
  promptVersion: '1',
  mode: 'batch',
  inputHash: `h-${Math.random()}`,
  reservedUsdNanos: Math.round(eur * NANO),
  reservedEurNanos: Math.round(eur * NANO),
  eurPerUsd: 1,
  ...extra,
});

async function idOf(externalId: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM offers WHERE external_id = ${externalId}`);
  return Number(r.rows[0]!.id);
}

async function matchOne(externalId: string) {
  const [o] = await pendingOffers(t.db, 1, { offerIds: [await idOf(externalId)] });
  return matchOffer(t.db, o!);
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  await syncTaxonomy(t.db);
  const r = await t.db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops`);
  emag = Number(r.rows.find((x) => x.slug === 'emag')!.id);
  dedeman = Number(r.rows.find((x) => x.slug === 'dedeman')!.id);
  await t.db.execute(sql`UPDATE shops SET trust_tier = 1 WHERE id = ${emag}`);
  await t.db.execute(sql`UPDATE shops SET trust_tier = 2 WHERE id = ${dedeman}`);
});
afterAll(async () => t?.drop());

describe('llm_usage ledger (monthly cap)', () => {
  it('reserves under the cap and refuses what would pass it, atomically', async () => {
    const before = await llmMonthToDate(t.db, monthStart);
    const cap = before.spentEurNanos + before.reservedEurNanos + 3 * NANO;
    expect(await llmReserve(t.db, [entry(1), entry(1)], cap, monthStart)).toHaveLength(2);
    expect(await llmReserve(t.db, [entry(1), entry(0.5)], cap, monthStart)).toBeNull(); // 3.5 > 3: nothing inserted
    expect(await llmReserve(t.db, [entry(1)], cap, monthStart)).toHaveLength(1);
    expect(await llmReserve(t.db, [entry(0.000001)], cap, monthStart)).toBeNull();
  });

  it('concurrent reservations never pass the cap together', async () => {
    const before = await llmMonthToDate(t.db, monthStart);
    const cap = before.spentEurNanos + before.reservedEurNanos + 7 * NANO;
    const results = await Promise.all(Array.from({ length: 20 }, () => llmReserve(t.db, [entry(1)], cap, monthStart)));
    expect(results.filter((r) => r !== null)).toHaveLength(7);
    const after = await llmMonthToDate(t.db, monthStart);
    expect(after.spentEurNanos + after.reservedEurNanos).toBe(cap);
  });

  it('settles at the billed cost, releases what was not billed and keeps estimates at the reservation', async () => {
    const before = await llmMonthToDate(t.db, monthStart);
    const ids = (await llmReserve(t.db, [entry(2), entry(2), entry(2)], Number.MAX_SAFE_INTEGER, monthStart))!;
    const usage = { inputTokens: 200, outputTokens: 50, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 1800 };
    await llmSettle(t.db, ids[0]!, { usage, costUsdNanos: 30_000, costEurNanos: 27_000 });
    await llmRelease(t.db, ids[1]!, 'batch item expired');
    await llmEstimate(t.db, [ids[2]!], 'connection lost');
    // Settling twice changes nothing (idempotent collection).
    await llmSettle(t.db, ids[0]!, { usage, costUsdNanos: 99, costEurNanos: 99 });
    await llmRelease(t.db, ids[2]!, 'late');
    const after = await llmMonthToDate(t.db, monthStart);
    expect(after.spentEurNanos - before.spentEurNanos).toBe(27_000 + 2 * NANO);
    expect(after.reservedEurNanos).toBe(before.reservedEurNanos);
    const rows = await t.db.execute<{ status: string; cost_eur_nanos: string; cache_read_tokens: number }>(sql`SELECT status, cost_eur_nanos::text, cache_read_tokens FROM llm_usage WHERE id = ANY(${sql.param(ids)}::bigint[]) ORDER BY id`);
    expect(rows.rows.map((r) => r.status)).toEqual(['billed', 'released', 'estimated']);
    expect(rows.rows[0]).toMatchObject({ cost_eur_nanos: '27000', cache_read_tokens: 1800 });
  });

  it('counts only the current month', async () => {
    const [id] = (await llmReserve(t.db, [entry(5)], Number.MAX_SAFE_INTEGER, monthStart))!;
    const before = await llmMonthToDate(t.db, monthStart);
    await t.db.execute(sql`UPDATE llm_usage SET created_at = ${new Date(monthStart.getTime() - 1000).toISOString()}::timestamptz WHERE id = ${id!}`);
    const after = await llmMonthToDate(t.db, monthStart);
    expect(before.reservedEurNanos - after.reservedEurNanos).toBe(5 * NANO);
    await llmRelease(t.db, id!, 'test');
  });

  it('tracks batches in flight and never resends a request in flight', async () => {
    const e = entry(0.01, { inputHash: 'hash-in-flight' });
    const ids = (await llmReserve(t.db, [e, entry(0.01)], Number.MAX_SAFE_INTEGER, monthStart))!;
    await llmAttachBatch(t.db, ids, 'msgbatch_test_1');
    const rows = await llmBatchRows(t.db, 'msgbatch_test_1');
    expect(rows.map((r) => r.customId).sort()).toEqual(ids.map((i) => `u${i}`).sort());
    expect((await llmInFlightBatches(t.db)).find((b) => b.batchId === 'msgbatch_test_1')?.items).toBe(2);
    expect(await llmInFlightHashes(t.db, ['hash-in-flight', 'other'])).toEqual(new Set(['hash-in-flight']));
    for (const id of ids) await llmRelease(t.db, id, 'test');
    expect(await llmInFlightHashes(t.db, ['hash-in-flight'])).toEqual(new Set());
  });

  it('turns reservations nobody will settle into estimates after an hour', async () => {
    const [stale, batch] = (await llmReserve(t.db, [entry(0.5), entry(0.5)], Number.MAX_SAFE_INTEGER, monthStart))!;
    await llmAttachBatch(t.db, [batch!], 'msgbatch_test_2');
    await t.db.execute(sql`UPDATE llm_usage SET created_at = now() - interval '2 hours' WHERE id IN (${stale!}, ${batch!})`);
    expect(await llmSweepStaleReservations(t.db, 60)).toBe(1);
    const r = await t.db.execute<{ id: string; status: string }>(sql`SELECT id::text, status FROM llm_usage WHERE id IN (${stale!}, ${batch!}) ORDER BY id`);
    expect(r.rows.map((x) => x.status)).toEqual(['estimated', 'reserved']); // a batch item waits for its batch
    await llmRelease(t.db, batch!, 'test');
  });

  it('reads EUR per USD from the ECB reference rates', async () => {
    await t.db.execute(sql`INSERT INTO fx_rates (day, currency, rate, source) VALUES (current_date, 'EUR', 5.0800, 'ecb'), (current_date, 'USD', 4.4000, 'ecb') ON CONFLICT DO NOTHING`);
    expect(await latestEurPerUsd(t.db)).toBeCloseTo(4.4 / 5.08, 6);
  });
});

describe('llm_results', () => {
  it('keeps a usable answer and lets an unusable one be replaced', async () => {
    const base = { kind: 'pair' as const, promptId: 'pair_verify', promptVersion: '1', model: 'claude-haiku-5-5' };
    await llmStoreResult(t.db, { ...base, inputHash: 'r1', ok: true, output: { same: true, confidence: 0.95 } });
    await llmStoreResult(t.db, { ...base, inputHash: 'r1', ok: false, error: 'late duplicate' });
    await llmStoreResult(t.db, { ...base, inputHash: 'r2', ok: false, error: 'refusal' });
    await llmStoreResult(t.db, { ...base, inputHash: 'r2', ok: true, output: { same: false, confidence: 0.97 } });
    const m = await llmResultsByHash(t.db, ['r1', 'r2', 'r3']);
    expect(m.get('r1')).toMatchObject({ ok: true, attempts: 1, output: { same: true } });
    expect(m.get('r2')).toMatchObject({ ok: true, attempts: 2, output: { same: false } });
    expect(m.has('r3')).toBe(false);
  });
});

describe('gray zone, LLM decisions and their reversal', () => {
  let product: number;
  let trusted: number;

  beforeAll(async () => {
    // A canonical product from brand + MPN, and a trusted-shop product from its title.
    await recordObservation(t.db, obs(emag, 'L-P1', 'Telefon mobil Samsung Galaxy A56 5G, 8GB RAM, 256GB, Negru', { brandName: 'Samsung', mpnNorm: 'SMA566BZKAEUE', attributes: { storageGb: 256, ramGb: 8, color: 'black' } }));
    expect((await matchOne('L-P1')).decision).toBe('new_product');
    product = Number((await t.db.execute<{ p: string }>(sql`SELECT product_id::text AS p FROM offers WHERE external_id = 'L-P1'`)).rows[0]!.p);
    await recordObservation(t.db, obs(emag, 'L-P2', 'Telefon mobil Xiaomi Redmi Note 14 Pro 5G, 8GB RAM, 256GB, Negru', { brandName: 'Xiaomi', attributes: { storageGb: 256, ramGb: 8 } }));
    expect((await matchOne('L-P2')).decision).toBe('new_product');
    trusted = Number((await t.db.execute<{ p: string }>(sql`SELECT product_id::text AS p FROM offers WHERE external_id = 'L-P2'`)).rows[0]!.p);
    // Icecat specs on the product and a natural person as marketplace seller: neither may reach the LLM.
    await t.db.execute(sql`INSERT INTO product_specs (product_id, source, locale, data, attribution) VALUES (${product}, 'icecat', 'ro', ${JSON.stringify({ Greutate: 'ICECAT-SENTINEL-195g' })}::jsonb, 'Icecat')`);
    // Gray-zone offers of a tier-2 shop: titles only.
    await recordObservation(t.db, obs(dedeman, 'L-G1', 'Telefon Samsung Galaxy A56 256GB negru', { brandName: 'Samsung', attributes: { storageGb: 256, color: 'black' }, sellerType: 'marketplace', sellerName: 'Ion Popescu PFA' }));
    await recordObservation(t.db, obs(dedeman, 'L-G2', 'Telefon Samsung Galaxy A56 5G 256GB', { brandName: 'Samsung', attributes: { storageGb: 256 } }));
    await recordObservation(t.db, obs(dedeman, 'L-G3', 'Telefon Xiaomi Redmi Note 14 Pro 256GB', { brandName: 'Xiaomi', mpnNorm: 'XMRN14PRO256', attributes: { storageGb: 256 } }));
    await recordObservation(t.db, obs(dedeman, 'L-G4', 'Telefon Xiaomi Redmi Note 14 Pro 256GB albastru', { brandName: 'Xiaomi', attributes: { storageGb: 256 } }));
    for (const id of ['L-G1', 'L-G2', 'L-G3', 'L-G4']) expect((await matchOne(id)).decision).toBe('needs_review');
  });

  it('lists review items with their candidates, without seller names or Icecat data', async () => {
    const gray = await llmGrayZoneOffers(t.db, 50);
    const g1 = gray.find((g) => g.offer.externalId === 'L-G1')!;
    expect(g1.shopName).toBe('Dedeman');
    expect(g1.candidates.map((c) => c.productId)).toContain(product);
    expect(g1.side).toMatchObject({ title: 'Telefon Samsung Galaxy A56 256GB negru', brand: 'Samsung', priceLei: '1500.00' });
    const wire = JSON.stringify(gray);
    expect(wire).not.toContain('Ion Popescu');
    expect(wire).not.toContain('ICECAT-SENTINEL');
  });

  it('applies an LLM accept (reversible), which the admin can send back to a human', async () => {
    const g1 = await idOf('L-G1');
    expect(await applyLlmAccept(t.db, g1, product, { model: 'claude-haiku-5-5', confidence: 0.94, reason: 'same A56 256GB black' })).toBe(true);
    const o = await t.db.execute<{ product_id: string; match_status: string }>(sql`SELECT product_id::text, match_status FROM offers WHERE id = ${g1}`);
    expect(o.rows[0]).toEqual({ product_id: String(product), match_status: 'auto' });
    const d = (await llmRecentDecisions(t.db)).find((x) => x.offerId === g1)!;
    expect(d).toMatchObject({ decision: 'accept', decidedBy: 'llm:claude-haiku-5-5', productId: product, current: true });
    // Applying again does nothing (the offer moved on).
    expect(await applyLlmAccept(t.db, g1, product, { model: 'claude-haiku-5-5', confidence: 0.94, reason: 'again' })).toBe(false);

    expect(await revertLlmDecision(t.db, g1, 'human:admin-1')).toEqual({ previousProductId: product });
    const back = await t.db.execute<{ product_id: string | null; match_status: string }>(sql`SELECT product_id::text, match_status FROM offers WHERE id = ${g1}`);
    expect(back.rows[0]).toEqual({ product_id: null, match_status: 'pending' });
    expect((await llmRecentDecisions(t.db)).find((x) => x.offerId === g1)!.current).toBe(false);
    // Back in the human queue; the LLM never takes it again; nothing left to undo.
    const queue = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM offers WHERE id = ${g1} AND match_status = 'pending' AND matched_at IS NOT NULL`);
    expect(queue.rows[0]!.n).toBe('1');
    expect((await llmGrayZoneOffers(t.db, 50)).some((g) => g.offer.id === g1)).toBe(false);
    expect(await revertLlmDecision(t.db, g1, 'human:admin-1')).toBeUndefined();
  });

  it('never decides over a human', async () => {
    const g2 = await idOf('L-G2');
    await decideManually(t.db, g2, { kind: 'reject' }, 'human:admin-1');
    expect(await applyLlmAccept(t.db, g2, product, { model: 'claude-haiku-5-5', confidence: 0.99, reason: 'x' })).toBe(false);
    expect((await llmGrayZoneOffers(t.db, 50)).some((g) => g.offer.id === g2)).toBe(false);
  });

  it('an LLM reject creates the product the offer identifies (brand + MPN), or leaves it unmatched', async () => {
    const [g3] = await pendingOffers(t.db, 1, { offerIds: [await idOf('L-G3')] });
    const r3 = await applyLlmReject(t.db, g3!, [trusted], { model: 'claude-sonnet-5-5', confidence: 0.96, reason: 'different color' });
    expect(r3.applied).toBe(true);
    expect(r3.newProductId).not.toBeNull();
    const d3 = await t.db.execute<{ decision: string; decided_by: string }>(sql`SELECT decision, decided_by FROM match_decisions WHERE offer_id = ${g3!.id} ORDER BY id`);
    expect(d3.rows.slice(-2)).toEqual([
      { decision: 'reject', decided_by: 'llm:claude-sonnet-5-5' },
      { decision: 'new_product', decided_by: 'llm:claude-sonnet-5-5' },
    ]);

    const [g4] = await pendingOffers(t.db, 1, { offerIds: [await idOf('L-G4')] });
    const r4 = await applyLlmReject(t.db, g4!, [trusted], { model: 'claude-haiku-5-5', confidence: 0.95, reason: 'blue is another variant' });
    expect(r4).toEqual({ applied: true, newProductId: null });
    const o4 = await t.db.execute<{ match_status: string; product_id: string | null }>(sql`SELECT match_status, product_id::text FROM offers WHERE id = ${g4!.id}`);
    expect(o4.rows[0]).toEqual({ match_status: 'unmatched', product_id: null });
    // Both rejects are listed and can be sent back to the review queue.
    const listed = await llmRecentDecisions(t.db, { decision: 'reject' });
    expect(listed.map((x) => x.offerId)).toEqual(expect.arrayContaining([g3!.id, g4!.id]));
    expect(await revertLlmDecision(t.db, g4!.id, 'human:admin-1')).toEqual({ previousProductId: null });
  });

  it('shows LLM opinions per candidate and the month spend', async () => {
    const g1 = await idOf('L-G1');
    await llmStoreResult(t.db, { kind: 'pair', inputHash: 'op-1', promptId: 'pair_verify', promptVersion: '1', model: 'claude-haiku-5-5', offerId: g1, productId: product, ok: true, output: { same: true, confidence: 0.82, reason: 'probably' } });
    await llmStoreResult(t.db, { kind: 'pair', inputHash: 'op-2', promptId: 'pair_verify', promptVersion: '1', model: 'claude-sonnet-5-5', offerId: g1, productId: product, ok: true, output: { same: true, confidence: 0.95, reason: 'sure' } });
    expect((await llmOpinions(t.db, [g1])).get(`${g1}:${product}`)).toEqual({ same: true, confidence: 0.95, reason: 'sure', model: 'claude-sonnet-5-5' });
    const s = await llmSpendSummary(t.db, monthStart);
    expect(s.spentEurNanos).toBeGreaterThan(0);
    expect(s.decisions.accept).toBeGreaterThanOrEqual(1);
    expect(s.decisions.reject).toBeGreaterThanOrEqual(2);
  });
});
