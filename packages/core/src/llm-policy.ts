import { REJECT_AT, type PairScore } from './matching';

/**
 * Gray-zone policy with LLM verification (M22, docs/03 §6.3, ADR-024). Pure.
 *
 * The rules (M07) leave an offer in the review queue when its best candidate scores between 0.30
 * and 0.97 without a hard conflict. The LLM checks each such viable candidate; then:
 *   - accept   exactly one candidate is confirmed (same, confidence ≥ 0.9, no conflicting
 *              attribute named by the LLM or found in LLM-extracted attributes) and no other
 *              candidate looks like the same product;
 *   - reject   every viable candidate is denied with confidence ≥ 0.9 (the offer then follows
 *              M07's "no acceptable candidate" rule: a new product or unmatched);
 *   - keep     anything else stays with a human (unsure answers, two look-alike candidates,
 *              unusable answers);
 *   - wait     an answer for a viable candidate is still missing.
 * M07's hard conflicts are never overridden: a candidate with one is not viable.
 */

export const LLM_ACCEPT_AT = 0.9;
export const LLM_REJECT_AT = 0.9;
/** An answer "same" below this confidence does not count as a look-alike. */
const LOOKALIKE_AT = 0.5;

export interface LlmPairAnswer {
  same: boolean;
  confidence: number;
  conflictingAttributes: string[];
  model: string;
  reason: string;
}

export interface GrayCandidate {
  productId: number;
  /** M07's score of the pair, recomputed on current data. */
  rule: Pick<PairScore, 'score' | 'conflicts'>;
  /** The answer that counts (the escalation model's when there is one); null = unusable answer. */
  answer: LlmPairAnswer | null | undefined;
  /** Conflicts between LLM-extracted offer attributes and the product (only blocks accepts). */
  extraConflicts?: string[];
}

export interface GrayPolicy {
  acceptAt: number;
  rejectAt: number;
}

export const DEFAULT_GRAY_POLICY: GrayPolicy = { acceptAt: LLM_ACCEPT_AT, rejectAt: LLM_REJECT_AT };

export type GrayDecision =
  | { action: 'accept'; productId: number; confidence: number; model: string; reason: string }
  | { action: 'reject'; productIds: number[]; confidence: number; model: string; reason: string }
  | { action: 'keep'; reason: string }
  | { action: 'wait'; reason: string };

export function isViable(c: Pick<GrayCandidate, 'rule'>): boolean {
  return c.rule.conflicts.length === 0 && c.rule.score > REJECT_AT;
}

/** An answer of the default model that should be asked again of the escalation model. */
export function needsEscalation(a: LlmPairAnswer | null | undefined, policy: GrayPolicy = DEFAULT_GRAY_POLICY): boolean {
  if (!a) return true;
  if (a.same) return a.confidence < policy.acceptAt || a.conflictingAttributes.length > 0;
  return a.confidence < policy.rejectAt;
}

export function decideGrayZone(cands: GrayCandidate[], policy: GrayPolicy = DEFAULT_GRAY_POLICY): GrayDecision {
  const viable = cands.filter(isViable);
  if (viable.length === 0) return { action: 'keep', reason: 'no viable candidate' };
  if (viable.some((c) => c.answer === undefined)) return { action: 'wait', reason: 'LLM answer pending' };
  if (viable.some((c) => c.answer === null)) return { action: 'keep', reason: 'LLM answer unusable' };
  const answered = viable as Array<GrayCandidate & { answer: LlmPairAnswer }>;
  const confirmed = answered.filter(
    (c) => c.answer.same && c.answer.confidence >= policy.acceptAt && c.answer.conflictingAttributes.length === 0 && (c.extraConflicts?.length ?? 0) === 0,
  );
  const lookalikes = answered.filter((c) => c.answer.same && c.answer.confidence >= LOOKALIKE_AT);
  if (confirmed.length === 1 && lookalikes.length === 1) {
    const c = confirmed[0]!;
    return { action: 'accept', productId: c.productId, confidence: c.answer.confidence, model: c.answer.model, reason: c.answer.reason };
  }
  if (lookalikes.length > 1) return { action: 'keep', reason: `LLM: ${lookalikes.length} candidates look like the same product (duplicates?)` };
  const blocked = answered.find((c) => c.answer.same && c.answer.confidence >= policy.acceptAt && (c.extraConflicts?.length ?? 0) > 0);
  if (blocked) return { action: 'keep', reason: `LLM same, but extracted attributes conflict: ${blocked.extraConflicts!.join(', ')}` };
  if (answered.every((c) => !c.answer.same && c.answer.confidence >= policy.rejectAt)) {
    const least = answered.reduce((m, c) => (c.answer.confidence < m.answer.confidence ? c : m));
    return {
      action: 'reject',
      productIds: answered.map((c) => c.productId),
      confidence: least.answer.confidence,
      model: least.answer.model,
      reason: answered.map((c) => `#${c.productId}: ${c.answer.reason}`).join(' | ').slice(0, 400),
    };
  }
  const best = answered.reduce((m, c) => (c.answer.same && (!m.answer.same || c.answer.confidence > m.answer.confidence) ? c : m));
  return { action: 'keep', reason: `LLM unsure (${best.answer.same ? 'same' : 'different'} ${best.answer.confidence.toFixed(2)})` };
}
