import type { Logger } from '@pretoscop/config/logger';
import {
  attributeConflicts,
  decideGrayZone,
  type GrayCandidate,
  type GrayDecision,
  isViable,
  type LlmPairAnswer,
  type MatchSide,
  needsEscalation,
  scorePair,
} from '@pretoscop/core';
import {
  applyLlmAccept,
  applyLlmReject,
  type Db,
  type GrayZoneCandidate,
  type GrayZoneOffer,
  llmBatchRows,
  llmGrayZoneOffers,
  llmInFlightBatches,
  llmInFlightHashes,
  llmResultsByHash,
  llmStoreResult,
  llmSweepStaleReservations,
  type StoredLlmResult,
} from '@pretoscop/db';
import {
  attributesV1,
  type BatchItem,
  type BatchRowInfo,
  type BudgetStatus,
  LlmBudgetExceededError,
  LlmCallError,
  type LlmClient,
  pairVerifyV1,
  type ParsedAnswer,
  prepare,
  type PreparedRequest,
  type PromptDef,
  type RawSide,
} from '@pretoscop/llm';
import type { LlmSettings } from './factory';

/**
 * LLM verification of the matching gray zone (M22, ADR-022), as one idempotent pass:
 *   1. collect: ended Message Batches are read; every answer is stored (`llm_results`) and its
 *      ledger row settled;
 *   2. decide: each review-queue item whose candidates all have answers gets the policy's verdict
 *      (`decideGrayZone`): accept / reject are written as `llm:<model>` decisions, "keep" leaves
 *      the item with a human;
 *   3. ask: the questions still missing (pair checks, escalations to the stronger model, attribute
 *      extraction when the offer lacks a hard attribute its candidate has) go out as one batch,
 *      within the monthly cap. Nothing is asked twice: answers are keyed by request hash and
 *      requests in flight are skipped.
 */

export type Subject = { kind: 'pair'; offerId: number; productId: number } | { kind: 'attributes'; offerId: number } | { kind: 'category'; key: string };

export interface PlannedItem extends BatchItem {
  subject: Subject;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prompt: PromptDef<any, unknown>;
}

export interface GrayPlan {
  items: PlannedItem[];
  decisions: Array<{ offer: GrayZoneOffer; decision: GrayDecision }>;
}

/** An unusable answer is asked again once, then the pair goes to the stronger model (or a human). */
export const MAX_ATTEMPTS = 2;

/**
 * Size attributes that identify a variant and that shop titles state in many formats our parser
 * can miss ("1 TB", "139 cm", "9 kg", "350 l"). When the offer lacks one its candidate has, the
 * title goes to attribute extraction; the extracted values are then checked against every hard
 * attribute of M07. RAM, colour and network are often simply absent from titles, and the pair
 * prompt already compares them, so they do not trigger an extraction on their own.
 */
const EXTRACTION_KEYS = ['storageGb', 'screenInches', 'capacityKg', 'capacityL'] as const;

export function offerRawSide(g: GrayZoneOffer): RawSide {
  return { shop: g.shopName, title: g.side.title, brand: g.side.brand, mpn: g.side.mpn, gtin: g.side.gtin, category: g.side.category, attributes: g.side.attributes, priceLei: g.side.priceLei };
}

export function productRawSide(c: GrayZoneCandidate): RawSide {
  return { title: c.side.title, brand: c.side.brand, mpn: c.side.mpn, gtin: c.side.gtin, category: c.side.category, attributes: c.side.attributes, priceLei: c.side.priceLei };
}

function matchSides(g: GrayZoneOffer, c: GrayZoneCandidate): [MatchSide, MatchSide] {
  return [
    { title: g.offer.title, brand: g.offer.brand, mpnNorm: g.offer.mpnNorm, gtin14: g.offer.gtin14, category: g.category, attributes: g.offer.attributes, mpnFromTitle: g.offer.mpnSource === 'title' },
    { title: c.side.title, brand: c.side.brand, mpnNorm: c.mpnNorm, gtin14: c.gtin14, category: c.side.category, attributes: c.side.attributes, mpnFromTitle: c.mpnFromTitle },
  ];
}

function pairAnswer(r: StoredLlmResult): LlmPairAnswer | null {
  if (!r.ok || !r.output) return null;
  const o = r.output;
  return {
    same: o.same === true,
    confidence: Number(o.confidence ?? 0),
    conflictingAttributes: Array.isArray(o.conflictingAttributes) ? (o.conflictingAttributes as string[]) : [],
    model: r.model,
    reason: String(o.reason ?? ''),
  };
}

function missingHardKeys(offer: Record<string, unknown>, product: Record<string, unknown>): string[] {
  return EXTRACTION_KEYS.filter((k) => product[k] !== undefined && product[k] !== null && (offer[k] === undefined || offer[k] === null));
}

interface Resolution {
  answer: LlmPairAnswer | null | undefined;
  ask: PreparedRequest | null;
}

/**
 * The answer that counts for one pair: the escalation model's when it has one; high-value pairs
 * go to it directly; the default model's answer is escalated when unsure or contradictory.
 */
function resolvePair(def: PreparedRequest, esc: PreparedRequest, highValue: boolean, results: Map<string, StoredLlmResult>, inflight: Set<string>, settings: LlmSettings): Resolution {
  const pending = (req: PreparedRequest): Resolution => ({ answer: undefined, ask: inflight.has(req.inputHash) ? null : req });
  const e = results.get(esc.inputHash);
  if (e?.ok) return { answer: pairAnswer(e), ask: null };
  const escalate = (): Resolution => (!e || e.attempts < MAX_ATTEMPTS ? pending(esc) : { answer: null, ask: null });
  if (highValue) return escalate();
  const d = results.get(def.inputHash);
  if (!d) return pending(def);
  if (!d.ok) return d.attempts < MAX_ATTEMPTS ? pending(def) : escalate();
  const a = pairAnswer(d)!;
  return needsEscalation(a, settings.policy) && esc.inputHash !== def.inputHash ? escalate() : { answer: a, ask: null };
}

/** Builds the questions still to ask and the decisions that are ready, for a list of review items. */
export async function planGrayZone(
  db: Db,
  gray: GrayZoneOffer[],
  settings: LlmSettings,
  log?: Pick<Logger, 'warn'>,
  /** Answers held in memory instead of `llm_results` (previews that must not write). */
  memory?: Map<string, StoredLlmResult>,
): Promise<GrayPlan> {
  type Draft = {
    offer: GrayZoneOffer;
    cands: Array<{ c: GrayZoneCandidate; rule: ReturnType<typeof scorePair>; def: PreparedRequest; esc: PreparedRequest; highValue: boolean }>;
    attr: PreparedRequest | null;
  };
  const drafts: Draft[] = [];
  for (const g of gray) {
    try {
      const cands = g.candidates
        .map((c) => {
          const [o, p] = matchSides(g, c);
          const input = { offer: offerRawSide(g), product: productRawSide(c) };
          const price = Math.max(Number(c.minTotalLei ?? 0), Number(g.side.priceLei ?? 0));
          return {
            c,
            rule: scorePair(o, p),
            def: prepare(pairVerifyV1, settings.routes.default, input),
            esc: prepare(pairVerifyV1, settings.routes.escalation, input),
            highValue: price >= settings.highValueRon,
          };
        })
        .filter((x) => isViable(x));
      const needAttrs = cands.some((x) => missingHardKeys(g.offer.attributes, x.c.side.attributes).length > 0);
      const attr = needAttrs ? prepare(attributesV1, settings.routes.default, { title: g.offer.title, category: g.category ?? g.offer.categoryRaw, brand: g.offer.brand }) : null;
      drafts.push({ offer: g, cands, attr });
    } catch (e) {
      // A prompt refused by the data guard is never sent; the item stays with a human.
      log?.warn({ offerId: g.offer.id, error: (e as Error).message }, 'llm: offer left to a human (prompt refused)');
    }
  }
  const hashes = drafts.flatMap((d) => [...d.cands.flatMap((x) => [x.def.inputHash, x.esc.inputHash]), ...(d.attr ? [d.attr.inputHash] : [])]);
  const [results, inflight] = memory ? [memory, new Set<string>()] : await Promise.all([llmResultsByHash(db, hashes), llmInFlightHashes(db, hashes)]);

  const items = new Map<string, PlannedItem>();
  const decisions: GrayPlan['decisions'] = [];
  for (const d of drafts) {
    let waiting = false;
    let extracted: { attributes: Record<string, unknown>; flags: string[] } | null = null;
    if (d.attr) {
      const r = results.get(d.attr.inputHash);
      if (r?.ok && r.output) {
        const out = r.output as { attributes?: Record<string, unknown>; isBundle?: boolean; isAccessory?: boolean; isRefurbished?: boolean };
        const flags = [out.isBundle ? 'bundle' : null, out.isAccessory ? 'accessory' : null, out.isRefurbished ? 'condition' : null].filter((x): x is string => !!x);
        extracted = { attributes: out.attributes ?? {}, flags };
      } else if (!r || (!r.ok && r.attempts < MAX_ATTEMPTS)) {
        waiting = true;
        if (!inflight.has(d.attr.inputHash)) items.set(d.attr.inputHash, { req: d.attr, meta: { purpose: 'attributes.extract', subject: { kind: 'attributes', offerId: d.offer.offer.id } }, subject: { kind: 'attributes', offerId: d.offer.offer.id }, prompt: attributesV1 });
      }
    }
    const cands: GrayCandidate[] = [];
    for (const x of d.cands) {
      const res = resolvePair(x.def, x.esc, x.highValue, results, inflight, settings);
      if (res.ask) {
        const subject: Subject = { kind: 'pair', offerId: d.offer.offer.id, productId: x.c.productId };
        items.set(res.ask.inputHash, { req: res.ask, meta: { purpose: 'match.verify', subject }, subject, prompt: pairVerifyV1 });
      }
      let extraConflicts: string[] | undefined;
      if (extracted) {
        // The offer's own attributes win; extracted values only fill gaps.
        const merged = { ...extracted.attributes, ...d.offer.offer.attributes };
        extraConflicts = [...extracted.flags, ...attributeConflicts(merged, x.c.side.attributes)];
      }
      cands.push({ productId: x.c.productId, rule: x.rule, answer: res.answer, extraConflicts });
    }
    if (waiting) continue;
    const decision = decideGrayZone(cands, settings.policy);
    if (decision.action !== 'wait') decisions.push({ offer: d.offer, decision });
  }
  return { items: [...items.values()], decisions };
}

/** Stores one answer under its subject (pair, extracted attributes or category suggestion). */
export async function storeAnswer(
  db: Db,
  subject: Subject,
  req: Pick<PreparedRequest, 'inputHash' | 'promptId' | 'promptVersion' | 'model'>,
  answer: ParsedAnswer<unknown>,
  usageId: number | null,
): Promise<void> {
  await llmStoreResult(db, {
    kind: subject.kind,
    inputHash: req.inputHash,
    promptId: req.promptId,
    promptVersion: req.promptVersion,
    model: req.model,
    offerId: subject.kind === 'category' ? null : subject.offerId,
    productId: subject.kind === 'pair' ? subject.productId : null,
    subjectKey: subject.kind === 'category' ? subject.key : null,
    ok: answer.ok,
    output: answer.ok ? (answer.value as Record<string, unknown>) : null,
    error: answer.ok ? null : answer.error,
    usageId,
  });
}

export interface CollectStats {
  batches: number;
  ended: number;
  results: number;
  stale: number;
}

/** Reads every ended batch in flight (idempotent: settled rows are skipped). */
export async function collectLlmBatches(db: Db, llm: LlmClient, log: Pick<Logger, 'info' | 'warn'>): Promise<CollectStats> {
  const stats: CollectStats = { batches: 0, ended: 0, results: 0, stale: await llmSweepStaleReservations(db) };
  // The eval CLI collects its own batches (purpose 'eval'); one it abandoned (older than 25 h, so
  // ended by the API) is collected here only to settle the ledger, its answers are dropped.
  const own = await llmInFlightBatches(db, { purposes: ['match.verify', 'attributes.extract', 'category.suggest'] });
  const abandoned = (await llmInFlightBatches(db, { purposes: ['eval'] })).filter((b) => Date.now() - new Date(b.createdAt).getTime() > 25 * 3_600_000);
  for (const b of [...own, ...abandoned]) {
    stats.batches++;
    const rows = await llmBatchRows(db, b.batchId);
    const byCustom = new Map(rows.map((r) => [r.customId, r]));
    const info = new Map<string, BatchRowInfo>(rows.map((r) => [r.customId, { usageId: r.usageId, promptId: r.promptId, promptVersion: r.promptVersion, model: r.model, eurPerUsd: r.eurPerUsd }]));
    try {
      const out = await llm.collectBatch(b.batchId, info, async (res) => {
        const row = byCustom.get(res.customId)!;
        // Expired or canceled items were never processed: ask again later, nothing to store.
        if (res.outcome === 'expired' || res.outcome === 'canceled') return;
        if (!['pair', 'attributes', 'category'].includes(String(row.subject.kind))) return; // abandoned eval batch
        await storeAnswer(db, row.subject as Subject, { inputHash: row.inputHash, promptId: row.promptId, promptVersion: row.promptVersion, model: row.model }, res.answer, res.billed ? row.usageId : null);
        stats.results++;
      });
      if (out.status === 'ended' || out.status === 'missing') stats.ended++;
    } catch (e) {
      log.warn({ batchId: b.batchId, error: (e as Error).message }, 'llm batch collection failed (retried next run)');
    }
  }
  return stats;
}

export interface DecideStats {
  accept: number;
  reject: number;
  keep: number;
  skipped: number;
  touched: number[];
}

export async function applyGrayDecisions(db: Db, decisions: GrayPlan['decisions'], settings: LlmSettings, log: Pick<Logger, 'info'>): Promise<DecideStats> {
  const s: DecideStats = { accept: 0, reject: 0, keep: 0, skipped: 0, touched: [] };
  for (const { offer, decision } of decisions) {
    if (decision.action === 'accept') {
      if (await applyLlmAccept(db, offer.offer.id, decision.productId, decision)) {
        s.accept++;
        s.touched.push(decision.productId);
        log.info({ offerId: offer.offer.id, productId: decision.productId, model: decision.model, confidence: decision.confidence }, 'llm accept');
      } else s.skipped++;
    } else if (decision.action === 'reject' && settings.autoReject) {
      const r = await applyLlmReject(db, offer.offer, decision.productIds, decision);
      if (r.applied) {
        s.reject++;
        if (r.newProductId) s.touched.push(r.newProductId);
        log.info({ offerId: offer.offer.id, rejected: decision.productIds, newProductId: r.newProductId, model: decision.model }, 'llm reject');
      } else s.skipped++;
    } else s.keep++;
  }
  return s;
}

export interface LlmRunStats {
  collect: CollectStats;
  offers: number;
  decided: DecideStats;
  asked: number;
  submitted: number;
  deferred: number;
  batchId: string | null;
  budget: BudgetStatus;
  stoppedByCap: boolean;
}

/**
 * One pass of LLM matching. `batch` mode sends the questions as one Message Batch (answers arrive
 * in a later pass); `sync` mode asks them one by one now and decides in up to three rounds
 * (pair → escalation), for small runs and the eval.
 */
export async function runLlmMatching(
  deps: { db: Db; llm: LlmClient; log: Logger; settings: LlmSettings },
  opts: { limit: number; mode: 'batch' | 'sync'; offerIds?: number[] },
): Promise<LlmRunStats> {
  const { db, llm, log, settings } = deps;
  const decided: DecideStats = { accept: 0, reject: 0, keep: 0, skipped: 0, touched: [] };
  const stats: LlmRunStats = { collect: await collectLlmBatches(db, llm, log), offers: 0, decided, asked: 0, submitted: 0, deferred: 0, batchId: null, budget: await llm.budget.status(), stoppedByCap: false };
  for (let round = 0; round < (opts.mode === 'sync' ? 4 : 1); round++) {
    const gray = await llmGrayZoneOffers(db, opts.limit, { offerIds: opts.offerIds });
    if (round === 0) stats.offers = gray.length;
    const plan = await planGrayZone(db, gray, settings, log);
    const d = await applyGrayDecisions(db, plan.decisions, settings, log);
    decided.accept += d.accept;
    decided.reject += d.reject;
    decided.skipped += d.skipped;
    decided.touched.push(...d.touched);
    decided.keep = d.keep;
    if (plan.items.length === 0) break;
    const items = plan.items.slice(0, settings.maxRequests);
    stats.asked += items.length;
    if (opts.mode === 'batch') {
      try {
        const sub = await llm.submitBatch(items);
        stats.batchId = sub.batchId;
        stats.submitted = sub.submitted.length;
        stats.deferred = sub.deferred.length + (plan.items.length - items.length);
        stats.stoppedByCap = sub.deferred.length > 0;
      } catch (e) {
        log.warn({ error: (e as Error).message }, 'llm batch not submitted (retried next run)');
      }
      break;
    }
    for (const it of items) {
      try {
        const r = await llm.call(it.prompt, it.req, it.meta);
        await storeAnswer(db, it.subject, it.req, r.answer, r.usageId);
        stats.submitted++;
      } catch (e) {
        if (e instanceof LlmBudgetExceededError) {
          stats.stoppedByCap = true;
          break;
        }
        if (!(e instanceof LlmCallError)) throw e;
        log.warn({ error: e.message, kind: e.kind }, 'llm call failed');
        if (e.status === 401 || e.status === 403) break; // a bad key fails every call
      }
    }
    if (stats.stoppedByCap) {
      stats.deferred = items.length - stats.submitted;
      break;
    }
  }
  stats.budget = await llm.budget.status();
  return stats;
}

export interface PreviewResult {
  offers: GrayZoneOffer[];
  decisions: GrayPlan['decisions'];
  asked: number;
  costEurNanos: number;
  stoppedByCap: boolean;
}

/**
 * The same decisions computed without writing anything: answers are kept in memory (mock runs on a
 * real database, demonstrations). Synchronous calls, up to three rounds (pair, escalation).
 */
export async function previewLlmMatching(deps: { db: Db; llm: LlmClient; log: Logger; settings: LlmSettings }, opts: { limit: number }): Promise<PreviewResult> {
  const { db, llm, log, settings } = deps;
  const memory = new Map<string, StoredLlmResult>();
  const offers = await llmGrayZoneOffers(db, opts.limit);
  const out: PreviewResult = { offers, decisions: [], asked: 0, costEurNanos: 0, stoppedByCap: false };
  for (let round = 0; round < 4; round++) {
    const plan = await planGrayZone(db, offers, settings, log, memory);
    out.decisions = plan.decisions;
    if (plan.items.length === 0 || out.stoppedByCap) break;
    for (const it of plan.items.slice(0, settings.maxRequests)) {
      try {
        const r = await llm.call(it.prompt, it.req, it.meta);
        const prev = memory.get(it.req.inputHash);
        memory.set(it.req.inputHash, {
          inputHash: it.req.inputHash,
          ok: r.answer.ok,
          output: r.answer.ok ? (r.answer.value as Record<string, unknown>) : null,
          error: r.answer.ok ? null : r.answer.error,
          attempts: (prev?.attempts ?? 0) + 1,
          model: it.req.model,
        });
        out.asked++;
        out.costEurNanos += r.costEurNanos;
      } catch (e) {
        if (e instanceof LlmBudgetExceededError) {
          out.stoppedByCap = true;
          break;
        }
        if (!(e instanceof LlmCallError)) throw e;
        log.warn({ error: e.message }, 'llm preview call failed');
      }
    }
  }
  return out;
}
