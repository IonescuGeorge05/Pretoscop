import { categorize, route, tokenSets } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { createProductFromOffer, pendingOffers, type PendingOffer } from './matching';

/**
 * LLM-assisted matching (M22): the cost ledger behind the monthly cap, stored answers, the gray-zone
 * work list, LLM decisions (append-only in `match_decisions` as `llm:<model>`) and their reversal
 * from the admin. What the LLM sees is selected here column by column: offers and catalogue
 * products only — never `product_specs`/`product_images` (Icecat, ADR-016), never seller names.
 */

// ---------------------------------------------------------------------------------------------
// Ledger (implements the LlmLedger contract of @pretoscop/llm; structural types, no import)

export interface LlmReservationRow {
  purpose: string;
  model: string;
  promptId: string;
  promptVersion: string;
  mode: 'sync' | 'batch';
  inputHash: string;
  reservedUsdNanos: number;
  reservedEurNanos: number;
  eurPerUsd: number;
  subject?: Record<string, unknown>;
}

export interface LlmSettlementRow {
  usage: { inputTokens: number; outputTokens: number; cacheWrite5mTokens: number; cacheWrite1hTokens: number; cacheReadTokens: number };
  costUsdNanos: number;
  costEurNanos: number;
  error?: string;
}

/** One lock for every check-and-reserve: concurrent jobs and CLIs can never pass the cap together. */
const CAP_LOCK = sql`pg_advisory_xact_lock(hashtext('pretoscop.llm_usage.cap'))`;

/** What a row counts against the cap: reservations and estimates at their reservation, bills at their cost. */
const COUNTED = sql`CASE status WHEN 'billed' THEN cost_eur_nanos WHEN 'released' THEN 0 ELSE reserved_eur_nanos END`;

export async function llmMonthToDate(db: Db, monthStart: Date): Promise<{ spentEurNanos: number; reservedEurNanos: number; calls: number }> {
  const r = await db.execute<{ spent: string; reserved: string; calls: string }>(sql`
    SELECT coalesce(sum(${COUNTED}) FILTER (WHERE status <> 'reserved'), 0)::text AS spent,
      coalesce(sum(reserved_eur_nanos) FILTER (WHERE status = 'reserved'), 0)::text AS reserved,
      count(*) FILTER (WHERE status <> 'released')::text AS calls
    FROM llm_usage WHERE created_at >= ${monthStart.toISOString()}::timestamptz`);
  const row = r.rows[0];
  return { spentEurNanos: Number(row?.spent ?? 0), reservedEurNanos: Number(row?.reserved ?? 0), calls: Number(row?.calls ?? 0) };
}

/** Atomic check-and-reserve under the cap; null (nothing inserted) when it would be exceeded. */
export async function llmReserve(db: Db, entries: LlmReservationRow[], capEurNanos: number, monthStart: Date): Promise<number[] | null> {
  if (entries.length === 0) return [];
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT ${CAP_LOCK}`);
    const used = await tx.execute<{ n: string }>(sql`
      SELECT coalesce(sum(${COUNTED}), 0)::text AS n FROM llm_usage WHERE created_at >= ${monthStart.toISOString()}::timestamptz`);
    const add = entries.reduce((s, e) => s + e.reservedEurNanos, 0);
    if (Number(used.rows[0]?.n ?? 0) + add > capEurNanos) return null;
    const ids: number[] = [];
    // Inserted one by one inside the transaction: ids come back in input order.
    for (const e of entries) {
      const r = await tx.execute<{ id: string }>(sql`
        INSERT INTO llm_usage (purpose, model, prompt_id, prompt_version, mode, input_hash, subject, eur_per_usd, reserved_usd_nanos, reserved_eur_nanos)
        VALUES (${e.purpose}, ${e.model}, ${e.promptId}, ${e.promptVersion}, ${e.mode}, ${e.inputHash}, ${JSON.stringify(e.subject ?? {})}::jsonb,
          ${e.eurPerUsd.toFixed(6)}, ${e.reservedUsdNanos}, ${e.reservedEurNanos})
        RETURNING id::text`);
      ids.push(Number(r.rows[0]!.id));
    }
    return ids;
  });
}

export async function llmAttachBatch(db: Db, ids: number[], batchId: string): Promise<void> {
  await db.execute(sql`UPDATE llm_usage SET batch_id = ${batchId}, custom_id = 'u' || id::text WHERE id = ANY(${sql.param(ids)}::bigint[])`);
}

export async function llmSettle(db: Db, id: number, s: LlmSettlementRow): Promise<void> {
  await db.execute(sql`
    UPDATE llm_usage SET status = 'billed', settled_at = now(), input_tokens = ${s.usage.inputTokens}, output_tokens = ${s.usage.outputTokens},
      cache_write_5m_tokens = ${s.usage.cacheWrite5mTokens}, cache_write_1h_tokens = ${s.usage.cacheWrite1hTokens}, cache_read_tokens = ${s.usage.cacheReadTokens},
      cost_usd_nanos = ${s.costUsdNanos}, cost_eur_nanos = ${s.costEurNanos}, error = ${s.error ?? null}
    WHERE id = ${id} AND status = 'reserved'`);
}

export async function llmRelease(db: Db, id: number, error: string): Promise<void> {
  await db.execute(sql`UPDATE llm_usage SET status = 'released', settled_at = now(), error = ${error.slice(0, 500)} WHERE id = ${id} AND status = 'reserved'`);
}

export async function llmEstimate(db: Db, ids: number[], error: string): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(sql`
    UPDATE llm_usage SET status = 'estimated', settled_at = now(), cost_usd_nanos = reserved_usd_nanos, cost_eur_nanos = reserved_eur_nanos, error = ${error.slice(0, 500)}
    WHERE id = ANY(${sql.param(ids)}::bigint[]) AND status = 'reserved'`);
}

/**
 * Reservations no batch or call will ever settle (the process died between reserving and sending,
 * or during a synchronous call): after `olderThanMinutes` they become estimates at their
 * reservation, which keeps them counted against the cap without blocking it forever.
 */
export async function llmSweepStaleReservations(db: Db, olderThanMinutes = 60): Promise<number> {
  const r = await db.execute(sql`
    UPDATE llm_usage SET status = 'estimated', settled_at = now(), cost_usd_nanos = reserved_usd_nanos, cost_eur_nanos = reserved_eur_nanos,
      error = 'stale reservation (no result recorded)'
    WHERE status = 'reserved' AND batch_id IS NULL AND created_at < now() - make_interval(mins => ${olderThanMinutes}::int)`);
  return r.rowCount ?? 0;
}

export async function llmInFlightBatches(db: Db): Promise<Array<{ batchId: string; items: number; createdAt: string }>> {
  const r = await db.execute<{ batch_id: string; n: string; created_at: string }>(sql`
    SELECT batch_id, count(*)::text AS n, min(created_at)::text AS created_at FROM llm_usage
    WHERE status = 'reserved' AND batch_id IS NOT NULL GROUP BY batch_id ORDER BY min(created_at)`);
  return r.rows.map((x) => ({ batchId: x.batch_id, items: Number(x.n), createdAt: x.created_at }));
}

export interface LlmBatchRow {
  usageId: number;
  customId: string;
  purpose: string;
  promptId: string;
  promptVersion: string;
  model: string;
  eurPerUsd: number;
  inputHash: string;
  subject: Record<string, unknown>;
}

export async function llmBatchRows(db: Db, batchId: string): Promise<LlmBatchRow[]> {
  const r = await db.execute<{ id: string; custom_id: string; purpose: string; prompt_id: string; prompt_version: string; model: string; eur_per_usd: string; input_hash: string; subject: Record<string, unknown> }>(sql`
    SELECT id::text, custom_id, purpose, prompt_id, prompt_version, model, eur_per_usd::text, input_hash, subject FROM llm_usage
    WHERE batch_id = ${batchId} AND status = 'reserved'`);
  return r.rows.map((x) => ({
    usageId: Number(x.id),
    customId: x.custom_id,
    purpose: x.purpose,
    promptId: x.prompt_id,
    promptVersion: x.prompt_version,
    model: x.model,
    eurPerUsd: Number(x.eur_per_usd),
    inputHash: x.input_hash,
    subject: x.subject ?? {},
  }));
}

/** Input hashes with a request in flight (never send the same request twice). */
export async function llmInFlightHashes(db: Db, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const r = await db.execute<{ input_hash: string }>(sql`
    SELECT DISTINCT input_hash FROM llm_usage WHERE status = 'reserved' AND input_hash = ANY(${sql.param(hashes)}::text[])`);
  return new Set(r.rows.map((x) => x.input_hash));
}

// ---------------------------------------------------------------------------------------------
// Results

export interface LlmResultInput {
  kind: 'pair' | 'attributes' | 'category';
  inputHash: string;
  promptId: string;
  promptVersion: string;
  model: string;
  offerId?: number | null;
  productId?: number | null;
  subjectKey?: string | null;
  ok: boolean;
  output?: Record<string, unknown> | null;
  error?: string | null;
  usageId?: number | null;
}

/** Stores an answer; a usable answer is never replaced, an unusable one is replaced by the next attempt. */
export async function llmStoreResult(db: Db, r: LlmResultInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO llm_results (kind, input_hash, prompt_id, prompt_version, model, offer_id, product_id, subject_key, ok, output, error, usage_id)
    VALUES (${r.kind}, ${r.inputHash}, ${r.promptId}, ${r.promptVersion}, ${r.model}, ${r.offerId ?? null}, ${r.productId ?? null}, ${r.subjectKey ?? null},
      ${r.ok}, ${r.output ? JSON.stringify(r.output) : null}::jsonb, ${r.error?.slice(0, 500) ?? null}, ${r.usageId ?? null})
    ON CONFLICT (input_hash) DO UPDATE SET ok = EXCLUDED.ok, output = EXCLUDED.output, error = EXCLUDED.error, usage_id = EXCLUDED.usage_id,
      attempts = llm_results.attempts + 1, updated_at = now()
    WHERE NOT llm_results.ok`);
}

export interface StoredLlmResult {
  inputHash: string;
  ok: boolean;
  output: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  model: string;
}

export async function llmResultsByHash(db: Db, hashes: string[]): Promise<Map<string, StoredLlmResult>> {
  if (hashes.length === 0) return new Map();
  const r = await db.execute<{ input_hash: string; ok: boolean; output: Record<string, unknown> | null; error: string | null; attempts: number; model: string }>(sql`
    SELECT input_hash, ok, output, error, attempts, model FROM llm_results WHERE input_hash = ANY(${sql.param(hashes)}::text[])`);
  return new Map(r.rows.map((x) => [x.input_hash, { inputHash: x.input_hash, ok: x.ok, output: x.output, error: x.error, attempts: x.attempts, model: x.model }]));
}

// ---------------------------------------------------------------------------------------------
// Gray zone: offers the rules left to a human, with their candidates

export interface LlmPairSide {
  title: string;
  brand: string | null;
  mpn: string | null;
  gtin: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
  priceLei: string | null;
}

export interface GrayZoneCandidate {
  productId: number;
  side: LlmPairSide;
  /** For M07's scorer (recomputed on current data). */
  mpnNorm: string | null;
  mpnFromTitle: boolean;
  gtin14: string | null;
  minTotalLei: string | null;
}

export interface GrayZoneOffer {
  offer: PendingOffer;
  shopName: string;
  side: LlmPairSide;
  category: string | null;
  candidates: GrayZoneCandidate[];
}

/**
 * Review-queue items the LLM may look at: pending offers whose latest decision is the rules'
 * `needs_review` (not "two strong candidates": duplicates are for a human), that no human has ever
 * decided or sent back, with their candidates (active products only).
 */
export async function llmGrayZoneOffers(db: Db, limit: number, opts: { offerIds?: number[] } = {}): Promise<GrayZoneOffer[]> {
  const ids = await db.execute<{ id: string; shop_name: string; total: string | null }>(sql`
    SELECT o.id::text, s.name AS shop_name, o.total_price::text AS total
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE o.match_status = 'pending' AND o.matched_at IS NOT NULL AND o.active AND NOT o.blacklisted
      ${opts.offerIds ? sql`AND o.id = ANY(${sql.param(opts.offerIds)}::bigint[])` : sql``}
      AND coalesce(o.match_reason, '') <> 'two strong candidates'
      AND (SELECT d.decided_by FROM match_decisions d WHERE d.offer_id = o.id ORDER BY d.id DESC LIMIT 1) = 'rule'
      AND (SELECT d.decision FROM match_decisions d WHERE d.offer_id = o.id ORDER BY d.id DESC LIMIT 1) = 'needs_review'
      AND NOT EXISTS (SELECT 1 FROM match_decisions d WHERE d.offer_id = o.id AND d.decided_by LIKE 'human:%')
      AND NOT EXISTS (SELECT 1 FROM offer_aliases a WHERE a.shop_id = o.shop_id AND a.external_id = o.external_id)
      AND EXISTS (SELECT 1 FROM match_candidates mc WHERE mc.offer_id = o.id)
    ORDER BY (SELECT coalesce(max(p.offer_count), 0) FROM match_candidates mc JOIN products p ON p.id = mc.product_id WHERE mc.offer_id = o.id) DESC, o.first_seen_at, o.id
    LIMIT ${limit}`);
  if (ids.rows.length === 0) return [];
  const offerIds = ids.rows.map((r) => Number(r.id));
  const offers = new Map((await pendingOffers(db, offerIds.length, { offerIds })).map((o) => [o.id, o]));
  const cands = await db.execute<{
    offer_id: string; product_id: string; title: string; brand: string | null; mpn: string | null; mpn_norm: string | null; mpn_source: string | null;
    category: string | null; attributes: Record<string, unknown> | null; gtin: string | null; min_total: string | null;
  }>(sql`
    SELECT mc.offer_id::text, p.id::text AS product_id, p.title, b.name AS brand, p.mpn, p.mpn_norm, p.mpn_source, c.slug AS category, p.attributes,
      (SELECT min(g.gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtin, p.min_total_price::text AS min_total
    FROM match_candidates mc JOIN products p ON p.id = mc.product_id
    LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE mc.offer_id = ANY(${sql.param(offerIds)}::bigint[]) AND p.status = 'active'
    ORDER BY mc.offer_id, mc.score DESC, p.id`);
  const byOffer = new Map<number, GrayZoneCandidate[]>();
  for (const c of cands.rows) {
    const list = byOffer.get(Number(c.offer_id)) ?? [];
    list.push({
      productId: Number(c.product_id),
      side: { title: c.title, brand: c.brand, mpn: c.mpn ?? c.mpn_norm, gtin: c.gtin, category: c.category, attributes: c.attributes ?? {}, priceLei: c.min_total },
      mpnNorm: c.mpn_norm,
      mpnFromTitle: c.mpn_source === 'title',
      gtin14: c.gtin,
      minTotalLei: c.min_total,
    });
    byOffer.set(Number(c.offer_id), list);
  }
  const out: GrayZoneOffer[] = [];
  for (const r of ids.rows) {
    const o = offers.get(Number(r.id));
    if (!o) continue;
    const category = categorize(o.title, o.categoryRaw, { isAccessory: o.isAccessory });
    out.push({
      offer: o,
      shopName: r.shop_name,
      category,
      side: { title: o.title, brand: o.brand, mpn: o.mpnRaw ?? o.mpnNorm, gtin: o.gtin14, category, attributes: o.attributes, priceLei: r.total },
      candidates: byOffer.get(o.id) ?? [],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Decisions

const still = (offerId: number) => sql`
  o.id = ${offerId} AND o.match_status = 'pending' AND o.active
  AND NOT EXISTS (SELECT 1 FROM match_decisions d WHERE d.offer_id = o.id AND d.decided_by LIKE 'human:%')
  AND NOT EXISTS (SELECT 1 FROM offer_aliases a WHERE a.shop_id = o.shop_id AND a.external_id = o.external_id)`;

/** LLM accept: links the offer (status 'auto', reversible like every automatic decision). Returns false when the offer moved on. */
export async function applyLlmAccept(db: Db, offerId: number, productId: number, a: { model: string; confidence: number; reason: string }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const reason = `LLM ${a.confidence.toFixed(2)}: ${a.reason}`.slice(0, 500);
    const u = await tx.execute(sql`
      UPDATE offers o SET product_id = ${productId}, match_status = 'auto', match_score = ${a.confidence}, match_reason = ${reason.slice(0, 300)}, matched_at = now(), updated_at = now()
      WHERE ${still(offerId)} AND EXISTS (SELECT 1 FROM products p WHERE p.id = ${productId} AND p.status = 'active')`);
    if ((u.rowCount ?? 0) === 0) return false;
    await tx.execute(sql`
      INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
      VALUES (${offerId}, ${productId}, 'accept', ${`llm:${a.model}`}, ${reason}, ${a.confidence})`);
    return true;
  });
}

/**
 * LLM reject of every candidate: the offer then follows M07's "no acceptable candidate" rule — a new
 * product when it identifies one (brand + GTIN or MPN, or a trusted shop's title), else unmatched.
 */
export async function applyLlmReject(
  db: Db,
  o: PendingOffer,
  productIds: number[],
  a: { model: string; confidence: number; reason: string },
): Promise<{ applied: boolean; newProductId: number | null }> {
  const by = `llm:${a.model}`;
  const reason = `LLM ${a.confidence.toFixed(2)} different: ${a.reason}`.slice(0, 500);
  const category = categorize(o.title, o.categoryRaw, { isAccessory: o.isAccessory });
  const routed = route(
    {
      gtin14: o.gtin14,
      mpnNorm: o.mpnNorm,
      brand: o.brand,
      category,
      condition: o.condition,
      isBundle: o.isBundle,
      isAccessory: o.isAccessory,
      trustedSource: o.trustTier === 1,
      hasModelToken: tokenSets(o.title).model.size > 0,
    },
    [],
  );
  return db.transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT o.id FROM offers o WHERE ${still(o.id)} FOR UPDATE`);
    if ((lock.rowCount ?? 0) === 0) return { applied: false, newProductId: null };
    await tx.execute(sql`
      INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
      VALUES (${o.id}, ${productIds[0] ?? null}, 'reject', ${by}, ${reason}, ${a.confidence})`);
    if (routed.decision === 'new_product') {
      const db2 = tx as unknown as Db;
      const productId = await createProductFromOffer(db2, o, category);
      await tx.execute(sql`
        INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
        VALUES (${o.id}, ${productId}, 'new_product', ${by}, ${`after LLM reject: ${routed.reasons.join('; ')}`.slice(0, 500)}, ${routed.score})`);
      await tx.execute(sql`
        UPDATE offers SET product_id = ${productId}, match_status = 'auto', match_score = ${routed.score},
          match_reason = ${`LLM: other product; ${routed.reasons.join('; ')}`.slice(0, 300)}, matched_at = now(), updated_at = now()
        WHERE id = ${o.id}`);
      return { applied: true, newProductId: productId };
    }
    await tx.execute(sql`
      UPDATE offers SET product_id = NULL, match_status = 'unmatched', match_score = ${a.confidence},
        match_reason = ${`LLM: none of the candidates; ${routed.reasons.join('; ')}`.slice(0, 300)}, matched_at = now(), updated_at = now()
      WHERE id = ${o.id}`);
    return { applied: true, newProductId: null };
  });
}

export interface LlmDecisionRow {
  decisionId: number;
  offerId: number;
  offerTitle: string;
  shop: string;
  decision: 'accept' | 'reject' | 'new_product';
  decidedBy: string;
  productId: number | null;
  productTitle: string | null;
  productSlug: string | null;
  score: number | null;
  reason: string | null;
  createdAt: string;
  /** Still the offer's latest decision (the undo applies to it). */
  current: boolean;
  matchStatus: string;
}

/** Recent LLM decisions for the admin (sample, undo). */
export async function llmRecentDecisions(db: Db, opts: { days?: number; limit?: number; decision?: 'accept' | 'reject' } = {}): Promise<LlmDecisionRow[]> {
  const r = await db.execute<{
    id: string; offer_id: string; title: string; shop: string; decision: LlmDecisionRow['decision']; decided_by: string; product_id: string | null;
    product_title: string | null; slug: string | null; score: number | null; reason: string | null; created_at: string; current: boolean; match_status: string;
  }>(sql`
    SELECT d.id::text, d.offer_id::text, coalesce(o.title_clean, o.title_raw) AS title, s.slug AS shop, d.decision, d.decided_by,
      d.product_id::text, p.title AS product_title, p.slug, d.score, d.reason, d.created_at::text,
      NOT EXISTS (SELECT 1 FROM match_decisions n WHERE n.offer_id = d.offer_id AND n.id > d.id AND n.decided_by NOT LIKE 'llm:%') AS current,
      o.match_status
    FROM match_decisions d JOIN offers o ON o.id = d.offer_id JOIN shops s ON s.id = o.shop_id LEFT JOIN products p ON p.id = d.product_id
    WHERE d.decided_by LIKE 'llm:%' AND d.decision IN ('accept', 'reject')
      AND d.created_at > now() - make_interval(days => ${opts.days ?? 30}::int)
      ${opts.decision ? sql`AND d.decision = ${opts.decision}` : sql``}
    ORDER BY d.id DESC LIMIT ${opts.limit ?? 50}`);
  return r.rows.map((x) => ({
    decisionId: Number(x.id),
    offerId: Number(x.offer_id),
    offerTitle: x.title,
    shop: x.shop,
    decision: x.decision,
    decidedBy: x.decided_by,
    productId: x.product_id ? Number(x.product_id) : null,
    productTitle: x.product_title,
    productSlug: x.slug,
    score: x.score,
    reason: x.reason,
    createdAt: x.created_at,
    current: x.current,
    matchStatus: x.match_status,
  }));
}

/**
 * Undo of an LLM decision from the admin: the offer goes back to the human review queue (pending,
 * product link removed) and a human-attributed `needs_review` row is appended, which also keeps the
 * LLM away from this offer from now on. Returns the product it was linked to, or undefined when the
 * offer's latest decision is not the LLM's (nothing to undo).
 */
export async function revertLlmDecision(db: Db, offerId: number, actor: string): Promise<{ previousProductId: number | null } | undefined> {
  return db.transaction(async (tx) => {
    const last = await tx.execute<{ decided_by: string; product_id: string | null }>(sql`
      SELECT d.decided_by, o.product_id::text FROM match_decisions d JOIN offers o ON o.id = d.offer_id
      WHERE d.offer_id = ${offerId} ORDER BY d.id DESC LIMIT 1 FOR UPDATE OF o`);
    const row = last.rows[0];
    if (!row || !row.decided_by.startsWith('llm:')) return undefined;
    await tx.execute(sql`
      UPDATE offers SET product_id = NULL, match_status = 'pending', match_reason = 'LLM decision reverted: human review', matched_at = now(), updated_at = now()
      WHERE id = ${offerId}`);
    await tx.execute(sql`
      INSERT INTO match_decisions (offer_id, product_id, decision, decided_by, reason, score)
      VALUES (${offerId}, NULL, 'needs_review', ${actor}, ${`LLM decision reverted (${row.decided_by})`}, NULL)`);
    return { previousProductId: row.product_id ? Number(row.product_id) : null };
  });
}

// ---------------------------------------------------------------------------------------------
// Admin: spend and LLM opinions

export interface LlmSpendSummary {
  spentEurNanos: number;
  reservedEurNanos: number;
  calls: number;
  billedCalls: number;
  inFlightBatches: number;
  inFlightItems: number;
  /** Prompt tokens read from the cache / all prompt tokens of billed calls. */
  cacheReadShare: number;
  byPurpose: Array<{ purpose: string; model: string; calls: number; eurNanos: number }>;
  decisions: { accept: number; reject: number };
}

export async function llmSpendSummary(db: Db, monthStart: Date): Promise<LlmSpendSummary> {
  const since = monthStart.toISOString();
  const [mtd, totals, by, dec] = await Promise.all([
    llmMonthToDate(db, monthStart),
    db.execute<{ billed: string; inflight_batches: string; inflight_items: string; read: string; prompt: string }>(sql`
      SELECT count(*) FILTER (WHERE status = 'billed')::text AS billed,
        count(DISTINCT batch_id) FILTER (WHERE status = 'reserved' AND batch_id IS NOT NULL)::text AS inflight_batches,
        count(*) FILTER (WHERE status = 'reserved')::text AS inflight_items,
        coalesce(sum(cache_read_tokens) FILTER (WHERE status = 'billed'), 0)::text AS read,
        coalesce(sum(input_tokens + cache_read_tokens + cache_write_5m_tokens + cache_write_1h_tokens) FILTER (WHERE status = 'billed'), 0)::text AS prompt
      FROM llm_usage WHERE created_at >= ${since}::timestamptz`),
    db.execute<{ purpose: string; model: string; calls: string; eur: string }>(sql`
      SELECT purpose, model, count(*) FILTER (WHERE status <> 'released')::text AS calls, coalesce(sum(${COUNTED}), 0)::text AS eur
      FROM llm_usage WHERE created_at >= ${since}::timestamptz GROUP BY purpose, model ORDER BY 4 DESC`),
    db.execute<{ decision: string; n: string }>(sql`
      SELECT decision, count(*)::text AS n FROM match_decisions
      WHERE decided_by LIKE 'llm:%' AND decision IN ('accept','reject') AND created_at >= ${since}::timestamptz GROUP BY decision`),
  ]);
  const t = totals.rows[0];
  const prompt = Number(t?.prompt ?? 0);
  return {
    ...mtd,
    billedCalls: Number(t?.billed ?? 0),
    inFlightBatches: Number(t?.inflight_batches ?? 0),
    inFlightItems: Number(t?.inflight_items ?? 0),
    cacheReadShare: prompt > 0 ? Number(t?.read ?? 0) / prompt : 0,
    byPurpose: by.rows.map((x) => ({ purpose: x.purpose, model: x.model, calls: Number(x.calls), eurNanos: Number(x.eur) })),
    decisions: { accept: Number(dec.rows.find((x) => x.decision === 'accept')?.n ?? 0), reject: Number(dec.rows.find((x) => x.decision === 'reject')?.n ?? 0) },
  };
}

export interface LlmOpinion {
  same: boolean;
  confidence: number;
  reason: string;
  model: string;
}

/** The latest usable pair answer for each (offer, product), for the review queue. */
export async function llmOpinions(db: Db, offerIds: number[]): Promise<Map<string, LlmOpinion>> {
  if (offerIds.length === 0) return new Map();
  const r = await db.execute<{ offer_id: string; product_id: string; output: Record<string, unknown>; model: string }>(sql`
    SELECT DISTINCT ON (offer_id, product_id) offer_id::text, product_id::text, output, model FROM llm_results
    WHERE kind = 'pair' AND ok AND offer_id = ANY(${sql.param(offerIds)}::bigint[]) AND product_id IS NOT NULL
    ORDER BY offer_id, product_id, (model LIKE 'claude-sonnet%') DESC, updated_at DESC`);
  return new Map(
    r.rows.map((x) => [
      `${x.offer_id}:${x.product_id}`,
      { same: x.output.same === true, confidence: Number(x.output.confidence ?? 0), reason: String(x.output.reason ?? ''), model: x.model },
    ]),
  );
}

/** EUR per USD from the latest ECB reference rates (RON per unit of each, `fx_rates`), when recent. */
export async function latestEurPerUsd(db: Db, maxAgeDays = 10): Promise<number | null> {
  const r = await db.execute<{ eur: string; usd: string }>(sql`
    SELECT e.rate::text AS eur, u.rate::text AS usd FROM fx_rates e JOIN fx_rates u ON u.day = e.day AND u.currency = 'USD'
    WHERE e.currency = 'EUR' AND e.day >= (now() AT TIME ZONE 'Europe/Bucharest')::date - ${maxAgeDays}::int
    ORDER BY e.day DESC LIMIT 1`);
  const row = r.rows[0];
  if (!row) return null;
  const eur = Number(row.eur);
  const usd = Number(row.usd);
  return eur > 0 && usd > 0 ? usd / eur : null;
}

// ---------------------------------------------------------------------------------------------
// Attribute extraction and category suggestions: work lists (titles and breadcrumbs only)

/** Hard attributes M07 compares, by category: an offer missing them is a candidate for extraction. */
export const HARD_ATTRIBUTES: Record<string, string[]> = {
  'telefoane-mobile': ['storageGb'],
  tablete: ['storageGb'],
  laptopuri: ['storageGb', 'ramGb'],
  televizoare: ['screenInches'],
  monitoare: ['screenInches'],
  'masini-de-spalat-rufe': ['capacityKg'],
  'uscatoare-de-rufe': ['capacityKg'],
  frigidere: ['capacityL'],
  congelatoare: ['capacityL'],
};

export async function offersMissingAttributes(db: Db, limit: number): Promise<Array<{ offerId: number; title: string; brand: string | null; category: string; missing: string[] }>> {
  const cats = Object.keys(HARD_ATTRIBUTES);
  const r = await db.execute<{ id: string; title: string; brand: string | null; category: string; attributes: Record<string, unknown> }>(sql`
    SELECT o.id::text, coalesce(o.title_clean, o.title_raw) AS title, o.brand_name AS brand, o.category_slug AS category, o.attributes
    FROM offers o WHERE o.active AND NOT o.blacklisted AND o.condition = 'new' AND NOT o.is_bundle AND NOT o.is_accessory
      AND o.category_slug = ANY(${sql.param(cats)}::text[])
    ORDER BY o.id DESC LIMIT ${limit * 20}`);
  const out: Array<{ offerId: number; title: string; brand: string | null; category: string; missing: string[] }> = [];
  for (const x of r.rows) {
    const missing = (HARD_ATTRIBUTES[x.category] ?? []).filter((k) => x.attributes?.[k] === undefined || x.attributes?.[k] === null);
    if (missing.length) out.push({ offerId: Number(x.id), title: x.title, brand: x.brand, category: x.category, missing });
    if (out.length >= limit) break;
  }
  return out;
}

/** Shop categories (breadcrumbs) whose offers our categorizer cannot place, with sample titles. */
export async function unmappedShopCategories(db: Db, limit: number): Promise<Array<{ shopSlug: string; shopName: string; path: string; offers: number; titles: string[] }>> {
  const r = await db.execute<{ slug: string; name: string; path: string; n: string; titles: string[] }>(sql`
    SELECT s.slug, s.name, o.category_raw AS path, count(*)::text AS n,
      (array_agg(coalesce(o.title_clean, o.title_raw) ORDER BY o.id))[1:5] AS titles
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE o.active AND o.category_slug IS NULL AND o.category_raw IS NOT NULL AND o.category_raw <> ''
    GROUP BY s.slug, s.name, o.category_raw ORDER BY count(*) DESC LIMIT ${limit}`);
  return r.rows.map((x) => ({ shopSlug: x.slug, shopName: x.name, path: x.path, offers: Number(x.n), titles: x.titles ?? [] }));
}
