import { describe, expect, it } from 'vitest';
import { decideGrayZone, type GrayCandidate, type LlmPairAnswer, needsEscalation } from './llm-policy';
import { evaluateWithLlm, type EvalPair, pairsToAsk } from './matching-eval';

const ans = (same: boolean, confidence: number, conflictingAttributes: string[] = []): LlmPairAnswer => ({ same, confidence, conflictingAttributes, model: 'claude-haiku-5-5', reason: 'r' });
const cand = (productId: number, answer: LlmPairAnswer | null | undefined, rule = { score: 0.8, conflicts: [] as string[] }, extraConflicts?: string[]): GrayCandidate => ({ productId, rule, answer, extraConflicts });

describe('gray-zone policy (M22)', () => {
  it('accepts exactly one confirmed candidate at confidence ≥ 0.9', () => {
    expect(decideGrayZone([cand(1, ans(true, 0.93)), cand(2, ans(false, 0.97))])).toMatchObject({ action: 'accept', productId: 1, confidence: 0.93 });
    expect(decideGrayZone([cand(1, ans(true, 0.9))])).toMatchObject({ action: 'accept' });
  });

  it('keeps unsure answers for a human', () => {
    expect(decideGrayZone([cand(1, ans(true, 0.89))])).toMatchObject({ action: 'keep' });
    expect(decideGrayZone([cand(1, ans(false, 0.6))])).toMatchObject({ action: 'keep' });
    expect(decideGrayZone([cand(1, null)])).toMatchObject({ action: 'keep', reason: 'LLM answer unusable' });
  });

  it('never accepts when the LLM itself names a conflicting attribute or extracted attributes conflict', () => {
    expect(decideGrayZone([cand(1, ans(true, 0.99, ['color']))])).toMatchObject({ action: 'keep' });
    expect(decideGrayZone([cand(1, ans(true, 0.99), undefined, ['storageGb 128≠256'])])).toMatchObject({ action: 'keep' });
  });

  it('never overrides a hard conflict of the rules (such a candidate is not viable)', () => {
    const conflicted = cand(1, ans(true, 0.99), { score: 0, conflicts: ['storageGb 128≠256'] });
    expect(decideGrayZone([conflicted])).toMatchObject({ action: 'keep', reason: 'no viable candidate' });
    // The conflicted candidate is ignored, the viable one decides.
    expect(decideGrayZone([conflicted, cand(2, ans(true, 0.95))])).toMatchObject({ action: 'accept', productId: 2 });
    // A candidate at or below M07's reject threshold is not viable either.
    expect(decideGrayZone([cand(1, ans(true, 0.99), { score: 0.3, conflicts: [] })])).toMatchObject({ action: 'keep' });
  });

  it('keeps two look-alike candidates for a human (probably duplicate products)', () => {
    expect(decideGrayZone([cand(1, ans(true, 0.95)), cand(2, ans(true, 0.7))])).toMatchObject({ action: 'keep' });
    expect(decideGrayZone([cand(1, ans(true, 0.95)), cand(2, ans(true, 0.92))])).toMatchObject({ action: 'keep' });
  });

  it('rejects only when every viable candidate is denied with confidence ≥ 0.9', () => {
    expect(decideGrayZone([cand(1, ans(false, 0.95)), cand(2, ans(false, 0.99))])).toMatchObject({ action: 'reject', productIds: [1, 2], confidence: 0.95 });
    expect(decideGrayZone([cand(1, ans(false, 0.95)), cand(2, ans(false, 0.85))])).toMatchObject({ action: 'keep' });
  });

  it('waits while an answer is pending', () => {
    expect(decideGrayZone([cand(1, ans(true, 0.99)), cand(2, undefined)])).toMatchObject({ action: 'wait' });
  });

  it('honours a stricter policy', () => {
    expect(decideGrayZone([cand(1, ans(true, 0.93))], { acceptAt: 0.95, rejectAt: 0.95 })).toMatchObject({ action: 'keep' });
  });

  it('escalates unsure or contradictory answers of the default model', () => {
    expect(needsEscalation(ans(true, 0.95))).toBe(false);
    expect(needsEscalation(ans(false, 0.95))).toBe(false);
    expect(needsEscalation(ans(true, 0.8))).toBe(true);
    expect(needsEscalation(ans(false, 0.7))).toBe(true);
    expect(needsEscalation(ans(true, 0.99, ['color']))).toBe(true);
    expect(needsEscalation(null)).toBe(true);
  });
});

const side = (title: string, extra: Partial<EvalPair['offer']> = {}): EvalPair['offer'] => ({ title, brand: 'Samsung', mpnNorm: null, gtin14: null, category: 'telefoane-mobile', attributes: {}, ...extra });

describe('eval harness with LLM answers (M22)', () => {
  // Title-only pairs land in the gray zone; a storage conflict is a rule reject.
  const pairs: EvalPair[] = [
    { id: 'pos1', offer: side('Samsung Galaxy S25 256GB negru'), product: side('Telefon Samsung Galaxy S25 5G 256GB Black'), same: true, source: 'human' },
    { id: 'pos2', offer: side('Samsung Galaxy A56 128GB'), product: side('Telefon mobil Samsung Galaxy A56 5G 128GB'), same: true, source: 'synthetic' },
    { id: 'neg1', offer: side('Samsung Galaxy S25 256GB'), product: side('Samsung Galaxy S25 Edge 256GB'), same: false, source: 'human' },
    { id: 'neg2', offer: side('Samsung Galaxy S25 128GB', { attributes: { storageGb: 128 } }), product: side('Samsung Galaxy S25 256GB', { attributes: { storageGb: 256 } }), same: false, source: 'family' },
  ];

  it('asks the LLM only about the gray zone in the production scope', () => {
    expect(pairsToAsk(pairs).map((p) => p.id)).toEqual(['pos1', 'pos2']);
  });

  it('reports precision, recall and the share decided by the LLM at each threshold', () => {
    const answers = new Map([
      ['pos1', { same: true, confidence: 0.95, conflictingAttributes: [] }],
      ['pos2', { same: true, confidence: 0.85, conflictingAttributes: [] }],
    ]);
    const [t80, t90] = evaluateWithLlm(pairs, answers, { thresholds: [0.8, 0.9] });
    expect(t80!.gray).toMatchObject({ asked: 2, llmAccepts: 2, llmCorrectAccepts: 2, llmAcceptPrecision: 1, decidedShare: 1 });
    expect(t90!.gray).toMatchObject({ asked: 2, llmAccepts: 1, decidedShare: 0.5 });
    expect(t90!.combined.accepts).toBe(1);
    expect(t90!.combined.falseAccepts).toEqual([]);
  });

  it('counts an LLM accept of a negative as a false accept', () => {
    // A negative the rules leave in the gray zone (tablet vs phone of the same series).
    const tricky: EvalPair = { id: 'neg3', offer: side('Samsung Galaxy Tab S10 128GB'), product: side('Samsung Galaxy S10 128GB'), same: false, source: 'human' };
    expect(pairsToAsk([tricky]).map((p) => p.id)).toEqual(['neg3']);
    const answers = new Map([['neg3', { same: true, confidence: 0.99, conflictingAttributes: [] }]]);
    const r = evaluateWithLlm([...pairs, tricky], answers, { thresholds: [0.9] })[0]!;
    expect(r.gray.falseAccepts).toEqual(['neg3']);
    expect(r.gray.llmAcceptPrecision).toBe(0);
    expect(r.combined.falseAccepts).toEqual(['neg3']);
    expect(r.bySource.human!.precision).toBe(0);
    // The LLM alone (every pair without a rule conflict) sees the edition pair too.
    expect(pairsToAsk(pairs, 'all').map((p) => p.id)).not.toContain('neg2');
  });

  it('pairs without an answer stay with a human', () => {
    const r = evaluateWithLlm(pairs, new Map(), { thresholds: [0.9] })[0]!;
    expect(r.gray).toMatchObject({ asked: 2, unanswered: 2, llmAccepts: 0, decidedShare: 0 });
    expect(r.combined.reviewRate).toBe(0.5);
  });
});
