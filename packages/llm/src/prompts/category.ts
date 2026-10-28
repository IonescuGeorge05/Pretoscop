import { TAXONOMY } from '@pretoscop/core';
import { redactPersonalData } from '../guard';
import { asObject, clamp01, InvalidOutputError, type PromptDef } from './types';

export interface CategoryInput {
  /** The shop's public name. */
  shop: string;
  /** The shop's breadcrumb ("Electrocasnice > Bucătărie > Espressoare"). */
  path: string;
  /** Up to five product titles from that shop category. */
  titles: string[];
}

export interface CategorySuggestion {
  slug: string | null;
  confidence: number;
  reason: string;
}

export const CATEGORY_SLUGS = TAXONOMY.map((n) => n.slug);

const TREE = TAXONOMY.map((n) => `- ${n.slug}: ${n.nameRo} (${n.nameEn})${n.parent ? `, under ${n.parent}` : ''}`).join('\n');

const SYSTEM = `You map a Romanian shop's own category to Pretoscop's category tree. Pretoscop is a Romanian price-comparison site; offers from a shop category we cannot map yet stay out of our category pages and are harder to match. You receive the shop's breadcrumb and a few product titles from that category. Pick the single most specific category of our tree that holds every product of the shop category, or null when none fits (for example a category of accessories, spare parts or products we do not list). A founder reviews every suggestion before it is applied.

Rules
- Prefer the deepest category that fits all the titles; use a parent category only when the titles span several of its children.
- Accessories for a device (cases, chargers, cables, straps, toner, filters) do not belong to the device's category: answer null unless the tree has a category for them.
- Breadcrumbs mix Romanian and English and may lack diacritics ("Masini de spalat" = "Mașini de spălat").
- confidence is your probability, from 0 to 1, that the category is right for every product in the shop category.
- reason is one short English sentence.

Our category tree (slug: Romanian name (English name), parent):
${TREE}

Answer with the JSON object of the schema and nothing else.`;

const SCHEMA = {
  type: 'object',
  properties: {
    category: { anyOf: [{ type: 'string', enum: CATEGORY_SLUGS }, { type: 'null' }] },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['category', 'confidence', 'reason'],
  additionalProperties: false,
};

export const categoryV1: PromptDef<CategoryInput, CategorySuggestion> = {
  id: 'category',
  version: '1',
  system: SYSTEM,
  schema: SCHEMA,
  user({ shop, path, titles }) {
    const clean = (s: string, n: number) => redactPersonalData(s.normalize('NFC').replace(/\s+/g, ' ').trim()).slice(0, n);
    return `Shop category:\n${JSON.stringify({ shop: clean(shop, 80), breadcrumb: clean(path, 300), titles: titles.slice(0, 5).map((t) => clean(t, 200)) })}`;
  },
  parse(json) {
    const o = asObject(json, 'category');
    if (o.category !== null && (typeof o.category !== 'string' || !CATEGORY_SLUGS.includes(o.category))) throw new InvalidOutputError('category: unknown slug');
    return { slug: (o.category as string | null) ?? null, confidence: clamp01(o.confidence, 'category.confidence'), reason: typeof o.reason === 'string' ? o.reason.slice(0, 300) : '' };
  },
};
