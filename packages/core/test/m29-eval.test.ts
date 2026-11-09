import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateCategory } from '../src/matching-eval-categories';
import type { EvalPair } from '../src/matching-eval';

// M29: the per-category eval sets (built by `pnpm --filter @pretoscop/worker match:eval:categories
// --build` from the recorded fixtures and the synthetic beauty generator) pass their gate.

const DIR = fileURLToPath(new URL('../src/matching-eval/categories/', import.meta.url));
const load = (prefix: string): EvalPair[] =>
  readdirSync(DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(DIR + f, 'utf8')) as EvalPair[]);

describe('category eval gates (precision ≥ 98% at the accept threshold, no accepted hard negative)', () => {
  it('books (recorded Libris and Elefant fixtures)', () => {
    const pairs = load('books-');
    const r = evaluateCategory('books', pairs);
    expect(r.failures).toEqual([]);
    expect(r.report.pairs).toBeGreaterThanOrEqual(100);
    expect(r.report.bySource.family?.pairs).toBeGreaterThanOrEqual(70);
    // Series negatives are rejected outright by hard conflicts, not left to a human.
    expect(r.report.bySource.family!.reviewRate).toBeLessThan(0.05);
    // Same ISBN accepts; title-only pairs never do (MATCHING.md).
    expect(r.report.outcomes.filter((o) => o.route === 'accept').every((o) => o.via === 'gtin')).toBe(true);
    expect(r.masked.accepts).toBe(0);
  });

  it('beauty (synthetic until a beauty feed records)', () => {
    const r = evaluateCategory('beauty', load('beauty-'));
    expect(r.failures).toEqual([]);
    expect(r.report.recall).toBe(1);
    expect(r.report.bySource.family?.accepts).toBe(0);
    expect(r.masked.accepts).toBe(0);
  });

  it('the gate fails on an accepted hard negative', () => {
    const side = { title: 'Harry Potter', brand: 'Art', mpnNorm: null, gtin14: '09786303218656', category: 'beletristica', attributes: { kind: 'book', bookSet: false } };
    const bad: EvalPair = { id: 'x', offer: side, product: side, same: false, source: 'family' };
    expect(evaluateCategory('books', [bad]).failures.join(' ')).toMatch(/precision 0\.0% < 98%.*accepted hard negatives/);
  });
});
