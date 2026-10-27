import { describe, expect, it } from 'vitest';
import { HOLDOUT_CORPUS, TITLE_CORPUS, type CorpusEntry } from './__corpus__/titles';
import { detectAccessory } from './accessory';
import { extractAttributes } from './attributes';
import { detectBrand } from './brands';
import { detectBundle } from './bundle';
import { detectCondition } from './condition';
import { extractMpnCandidates } from './mpn';
import { cleanTitleDetailed } from './text';

const FIELDS = [
  'brand',
  'mpn',
  'storageGb',
  'ramGb',
  'screenInches',
  'color',
  'energyClass',
  'capacityL',
  'capacityKg',
  'condition',
  'isBundle',
  'isAccessory',
] as const;
type Field = (typeof FIELDS)[number];

function actual(entry: CorpusEntry): Record<Field, unknown> {
  const cleaned = cleanTitleDetailed(entry.title);
  const brand = detectBrand(cleaned.title);
  const attrs = extractAttributes(cleaned.title, { brand: brand?.name ?? null });
  const mpn = extractMpnCandidates(cleaned.title, {
    brand: brand?.name ?? null,
    productCode: cleaned.productCode,
  })[0];
  return {
    brand: brand?.name ?? null,
    mpn: mpn?.norm ?? null,
    storageGb: attrs.storageGb,
    ramGb: attrs.ramGb,
    screenInches: attrs.screenInches,
    color: attrs.color,
    energyClass: attrs.energyClass,
    capacityL: attrs.capacityL,
    capacityKg: attrs.capacityKg,
    condition: detectCondition(cleaned.title).condition,
    isBundle: detectBundle(cleaned.title).isBundle,
    isAccessory: detectAccessory(cleaned.title).isAccessory,
  };
}

function expected(entry: CorpusEntry): Record<Field, unknown> {
  const e = entry.expect;
  return {
    brand: e.brand,
    mpn: e.mpn ?? null,
    storageGb: e.storageGb,
    ramGb: e.ramGb,
    screenInches: e.screenInches,
    color: e.color,
    energyClass: e.energyClass,
    capacityL: e.capacityL,
    capacityKg: e.capacityKg,
    condition: e.condition ?? 'new',
    isBundle: e.isBundle ?? false,
    isAccessory: e.isAccessory ?? false,
  };
}

function evaluate(name: string, corpus: readonly CorpusEntry[]): Record<Field, number> {
  const correct = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
  const misses: string[] = [];
  for (const entry of corpus) {
    const a = actual(entry);
    const e = expected(entry);
    for (const f of FIELDS) {
      if (a[f] === e[f]) correct[f]++;
      else misses.push(`${f}: expected ${String(e[f])}, got ${String(a[f])} — ${entry.title}`);
    }
  }
  const n = corpus.length;
  const table = FIELDS.map((f) => `${f.padEnd(13)} ${((correct[f] / n) * 100).toFixed(1)}%`);
  const overall = FIELDS.reduce((sum, f) => sum + correct[f], 0) / (n * FIELDS.length);
  console.log(
    [
      `${name}: ${n} titles`,
      ...table,
      `overall       ${(overall * 100).toFixed(2)}%`,
      '',
      'Misses:',
      ...misses,
    ].join('\n'),
  );
  return Object.fromEntries(FIELDS.map((f) => [f, correct[f] / n])) as Record<Field, number>;
}

describe('labelled title corpus (synthetic, see __corpus__/titles.ts)', () => {
  it('has at least 150 titles', () => {
    expect(TITLE_CORPUS.length + HOLDOUT_CORPUS.length).toBeGreaterThanOrEqual(150);
  });

  it('reaches at least 95% accuracy on every labelled field', () => {
    const accuracy = evaluate('Main corpus', TITLE_CORPUS);
    for (const f of FIELDS) expect(accuracy[f], f).toBeGreaterThanOrEqual(0.95);
  });

  it('keeps the holdout batch at 95% or more (first run before fixes: see the M06 report)', () => {
    const accuracy = evaluate('Holdout corpus', HOLDOUT_CORPUS);
    for (const f of FIELDS) expect(accuracy[f], f).toBeGreaterThanOrEqual(0.95);
  });
});
