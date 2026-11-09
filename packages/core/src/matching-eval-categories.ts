import { evaluatePairs, type EvalPair, type EvalReport } from './matching-eval';

/**
 * Matching evaluation per category (M29): every category-expansion vertical has its own labelled
 * set (`src/matching-eval/categories/<vertical>-*.json`, kept apart from the M07/M22 set) and its
 * own gate, measured as the matcher routes each pair (accept at ≥ 0.97 without a hard conflict):
 *
 * - precision on automatic accepts ≥ 98 %, with identifiers and with identifiers masked;
 * - zero accepted negatives of label `family` (another book of the series, another size or
 *   concentration of a fragrance): the costly errors.
 *
 * Synthetic pairs (titles rewritten the way other shops write them, identifiers generated) prove
 * recall and rule coverage, not precision on real data: the report says how many accepts rest on
 * real labels, and the founders' labels replace them once both shops of a category record.
 */

export const CATEGORY_PRECISION_GATE = 0.98;

export interface CategoryEvalResult {
  category: string;
  report: EvalReport;
  masked: EvalReport;
  /** Accepts whose label is not synthetic (real recorded pages or human labels). */
  realAccepts: number;
  failures: string[];
}

export function evaluateCategory(category: string, pairs: EvalPair[]): CategoryEvalResult {
  const report = evaluatePairs(pairs);
  const masked = evaluatePairs(pairs, { mask: true });
  const failures: string[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (pairs.length === 0) failures.push(`${category}: no labelled pairs`);
  for (const [label, r] of [['as seen', report], ['identifiers masked', masked]] as const) {
    if (r.precision < CATEGORY_PRECISION_GATE) failures.push(`${category} (${label}): precision ${pct(r.precision)} < 98%`);
    const fam = r.bySource.family;
    if (fam && fam.falseAccepts.length > 0) failures.push(`${category} (${label}): ${fam.falseAccepts.length} accepted hard negatives (${fam.falseAccepts.slice(0, 3).join(', ')})`);
  }
  const realAccepts = report.outcomes.filter((o) => o.route === 'accept' && o.source !== 'synthetic').length;
  return { category, report, masked, realAccepts, failures };
}
