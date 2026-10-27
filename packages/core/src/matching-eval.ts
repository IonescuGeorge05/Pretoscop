import { ACCEPT_AT, REJECT_AT, scorePair, type MatchSide } from './matching';

/**
 * Evaluation harness for matching v1 (M07). A labelled pair is an incoming offer, a candidate
 * product and the truth. The harness routes every pair the way the matcher would with that single
 * candidate (accept at ≥ ACCEPT_AT without a hard conflict, review above REJECT_AT, otherwise no
 * match) and reports precision on accepts, recall and the review rate, overall and per label source.
 *
 * Label sources: `human` (founders, through `pnpm match:label`), `gtin` / `mpn` (two shops agree
 * on a valid GTIN or a brand + field MPN), `family` (two variants of one model with different
 * field MPNs: hard negatives) and `synthetic` (a real title rewritten the way other shops write it;
 * useful for recall, not proof of precision).
 */

export type LabelSource = 'human' | 'gtin' | 'mpn' | 'family' | 'synthetic';

export interface EvalPair {
  id: string;
  offer: MatchSide;
  product: MatchSide;
  same: boolean;
  source: LabelSource;
  note?: string;
}

export type EvalRoute = 'accept' | 'review' | 'reject';

export interface EvalOutcome {
  id: string;
  route: EvalRoute;
  score: number;
  via: string;
  conflicts: string[];
  same: boolean;
  source: LabelSource;
}

export interface EvalStats {
  pairs: number;
  positives: number;
  negatives: number;
  accepts: number;
  correctAccepts: number;
  /** Correct accepts / accepts (1 when nothing was accepted). */
  precision: number;
  /** Correct accepts / positives. */
  recall: number;
  /** Share of pairs left to a human. */
  reviewRate: number;
  /** Negatives that would have been auto-accepted (the costly error). */
  falseAccepts: string[];
  /** Positives sent to "no match" (missed, but harmless: a new product or the review queue). */
  missed: string[];
}

export interface EvalReport extends EvalStats {
  bySource: Partial<Record<LabelSource, EvalStats>>;
  /** Accepts decided by a GTIN or MPN match (target ≥ 99% precision on human labels). */
  identifierAccepts: EvalStats;
  outcomes: EvalOutcome[];
}

export function routePair(pair: Pick<EvalPair, 'offer' | 'product'>): { route: EvalRoute; score: number; via: string; conflicts: string[] } {
  const s = scorePair(pair.offer, pair.product);
  const route: EvalRoute = s.conflicts.length === 0 && s.score >= ACCEPT_AT ? 'accept' : s.conflicts.length === 0 && s.score > REJECT_AT ? 'review' : 'reject';
  return { route, score: s.score, via: s.via, conflicts: s.conflicts };
}

function stats(outcomes: EvalOutcome[]): EvalStats {
  const accepts = outcomes.filter((o) => o.route === 'accept');
  const correct = accepts.filter((o) => o.same);
  const positives = outcomes.filter((o) => o.same).length;
  return {
    pairs: outcomes.length,
    positives,
    negatives: outcomes.length - positives,
    accepts: accepts.length,
    correctAccepts: correct.length,
    precision: accepts.length ? correct.length / accepts.length : 1,
    recall: positives ? correct.length / positives : 1,
    reviewRate: outcomes.length ? outcomes.filter((o) => o.route === 'review').length / outcomes.length : 0,
    falseAccepts: accepts.filter((o) => !o.same).map((o) => o.id),
    missed: outcomes.filter((o) => o.same && o.route === 'reject').map((o) => o.id),
  };
}

/** Masks identifiers so only titles and attributes decide (measures the title scorer alone). */
export function maskIdentifiers(pair: EvalPair): EvalPair {
  const strip = (s: MatchSide): MatchSide => ({ ...s, gtin14: null, mpnNorm: null, mpnFromTitle: false });
  return { ...pair, offer: strip(pair.offer), product: strip(pair.product) };
}

export function evaluatePairs(pairs: EvalPair[], opts: { mask?: boolean } = {}): EvalReport {
  const outcomes: EvalOutcome[] = pairs.map((p0) => {
    const p = opts.mask ? maskIdentifiers(p0) : p0;
    const r = routePair(p);
    return { id: p.id, ...r, same: p.same, source: p.source };
  });
  const bySource: Partial<Record<LabelSource, EvalStats>> = {};
  for (const src of ['human', 'gtin', 'mpn', 'family', 'synthetic'] as const) {
    const sub = outcomes.filter((o) => o.source === src);
    if (sub.length) bySource[src] = stats(sub);
  }
  return {
    ...stats(outcomes),
    bySource,
    identifierAccepts: stats(outcomes.filter((o) => o.via === 'gtin' || o.via === 'mpn')),
    outcomes,
  };
}

/**
 * Rewrites a real title the way other Romanian shops commonly write the same product (product
 * type word, order of the memory figures, punctuation, colour language, dropped boilerplate).
 * Deterministic for a given seed. Only for `synthetic` positives.
 */
export function rewriteTitle(title: string, seed: number): string {
  let t = title;
  const pick = (n: number) => (seed >> n) & 1;
  if (pick(0)) t = t.replace(/^Telefon mobil\s+/i, 'Smartphone ');
  if (pick(1)) t = t.replace(/,\s*/g, ' ');
  if (pick(2)) t = t.replace(/\bDual SIM\b\s*,?\s*/i, '');
  if (pick(3)) {
    const colors: Array<[RegExp, string]> = [
      [/\bNegru\b/i, 'Black'],
      [/\bAlb\b/i, 'White'],
      [/\bAlbastru\b/i, 'Blue'],
      [/\bArgintiu\b/i, 'Silver'],
      [/\bGri\b/i, 'Gray'],
      [/\bVerde\b/i, 'Green'],
    ];
    for (const [re, en] of colors) t = t.replace(re, en);
  }
  if (pick(4)) t = t.replace(/\b(\d+)\s?GB RAM\b/i, '$1 GB RAM');
  if (pick(5)) t = t.replace(/\s*\b5G\b\s*,?/i, ' ');
  return t.replace(/\s{2,}/g, ' ').trim();
}
