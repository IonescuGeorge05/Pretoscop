import { describe, expect, it } from 'vitest';
import { evaluatePairs, rewriteTitle, routePair, type EvalPair } from './matching-eval';
import type { MatchSide } from './matching';

const side = (title: string, extra: Partial<MatchSide> = {}): MatchSide => ({
  title,
  brand: 'Samsung',
  mpnNorm: null,
  gtin14: null,
  category: 'telefoane-mobile',
  attributes: {},
  ...extra,
});

const pairs: EvalPair[] = [
  {
    id: 'same-gtin',
    offer: side('Samsung Galaxy S26 256GB negru', { gtin14: '08806095123456', attributes: { storageGb: 256 } }),
    product: side('Telefon mobil Samsung Galaxy S26, 12GB RAM, 256GB, 5G, Black', { gtin14: '08806095123456', attributes: { storageGb: 256 } }),
    same: true,
    source: 'gtin',
  },
  {
    id: 'storage-variant',
    offer: side('Telefon mobil Samsung Galaxy S26, 12GB RAM, 512GB, 5G, Black', { attributes: { storageGb: 512 } }),
    product: side('Telefon mobil Samsung Galaxy S26, 12GB RAM, 256GB, 5G, Black', { attributes: { storageGb: 256 } }),
    same: false,
    source: 'family',
  },
  {
    id: 'other-model',
    offer: side('Telefon mobil Samsung Galaxy A57, 8GB RAM, 256GB, 5G, Black', { attributes: { storageGb: 256 } }),
    product: side('Telefon mobil Samsung Galaxy S26, 12GB RAM, 256GB, 5G, Black', { attributes: { storageGb: 256 } }),
    same: false,
    source: 'human',
  },
];

describe('matching eval harness', () => {
  it('routes like the matcher: identifiers accept, conflicting storage never does', () => {
    expect(routePair(pairs[0]!).route).toBe('accept');
    const variant = routePair(pairs[1]!);
    expect(variant.route).toBe('reject');
    expect(variant.conflicts.join(' ')).toContain('storageGb');
  });

  it('reports precision, recall and per-source stats', () => {
    const r = evaluatePairs(pairs);
    expect(r).toMatchObject({ pairs: 3, positives: 1, negatives: 2, accepts: 1, correctAccepts: 1, precision: 1, recall: 1 });
    expect(r.falseAccepts).toEqual([]);
    expect(r.bySource.family).toMatchObject({ pairs: 1, accepts: 0 });
    expect(r.identifierAccepts).toMatchObject({ accepts: 1, precision: 1 });
  });

  it('masking identifiers leaves the title scorer alone', () => {
    const r = evaluatePairs(pairs, { mask: true });
    expect(r.outcomes.find((o) => o.id === 'same-gtin')?.via).not.toBe('gtin');
  });

  it('rewrites titles deterministically', () => {
    const t = 'Telefon mobil Samsung Galaxy S26, Dual SIM, 12GB RAM, 256GB, 5G, Negru';
    expect(rewriteTitle(t, 0)).toBe(t);
    expect(rewriteTitle(t, 0b1111)).toBe('Smartphone Samsung Galaxy S26 12GB RAM 256GB 5G Black');
    expect(rewriteTitle(t, 7)).toBe(rewriteTitle(t, 7));
  });
});
