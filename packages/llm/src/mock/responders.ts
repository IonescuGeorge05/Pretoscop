import type Anthropic from '@anthropic-ai/sdk';
import { categorize, detectAccessory, detectBundle, extractAttributes, normalizeMpn, scorePair, type MatchSide } from '@pretoscop/core';
import type { MockBatchOutcome, MockResponder } from './server';

/**
 * Responders for the mock API. `heuristicResponder` answers every prompt with our own rule-based
 * code (the M07 scorer, the M06 attribute parser, the categorizer) so pipelines can run end to end
 * without a key. Its answers say nothing about Claude's quality: never report numbers from it as
 * an evaluation (the CLIs print a MOCK banner).
 */

export type PromptKind = 'pair_verify' | 'attributes' | 'category' | 'unknown';

export function promptKindOf(p: Anthropic.MessageCreateParamsNonStreaming): PromptKind {
  const props = ((p.output_config as { format?: { schema?: { properties?: Record<string, unknown> } } } | undefined)?.format?.schema?.properties ?? {}) as Record<string, unknown>;
  if ('same_product' in props) return 'pair_verify';
  if ('storage_gb' in props) return 'attributes';
  if ('category' in props) return 'category';
  return 'unknown';
}

export function userText(p: Anthropic.MessageCreateParamsNonStreaming): string {
  const m = p.messages[p.messages.length - 1];
  if (!m) return '';
  return typeof m.content === 'string' ? m.content : m.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

/** The JSON objects of a user message, in order (one per line). */
export function jsonBlocks(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function side(o: Record<string, unknown>): MatchSide {
  return {
    title: String(o.title ?? ''),
    brand: typeof o.brand === 'string' ? o.brand : null,
    mpnNorm: typeof o.mpn === 'string' ? normalizeMpn(o.mpn) : null,
    gtin14: typeof o.gtin === 'string' ? o.gtin.padStart(14, '0') : null,
    category: typeof o.category === 'string' ? o.category : null,
    attributes: (o.attributes as Record<string, unknown>) ?? {},
  };
}

/** Rule-based answer for a pair (a stand-in, not a model). */
export function heuristicPair(offer: Record<string, unknown>, product: Record<string, unknown>): { same_product: boolean; confidence: number; conflicting_attributes: string[]; reason: string } {
  const title = String(offer.title ?? '');
  if (detectBundle(title).isBundle) return { same_product: false, confidence: 0.95, conflicting_attributes: ['bundle'], reason: 'mock: the offer is a bundle' };
  if (detectAccessory(title).isAccessory) return { same_product: false, confidence: 0.95, conflicting_attributes: ['accessory'], reason: 'mock: the offer is an accessory' };
  const s = scorePair(side(offer), side(product));
  if (s.conflicts.length) return { same_product: false, confidence: 0.95, conflicting_attributes: s.conflicts.map((c) => c.split(' ')[0]!), reason: `mock: conflicts ${s.conflicts.join(', ')}` };
  const sim = Math.max(s.score, Number(s.features.titleSim ?? 0));
  if (sim >= 0.75) return { same_product: true, confidence: Math.min(0.99, 0.55 + sim / 2), conflicting_attributes: [], reason: `mock: titles agree (${sim.toFixed(2)})` };
  return { same_product: false, confidence: Math.min(0.95, 0.5 + (0.75 - sim)), conflicting_attributes: [], reason: `mock: titles differ (${sim.toFixed(2)})` };
}

function heuristicAttributes(o: Record<string, unknown>) {
  const title = String(o.title ?? '');
  const a = extractAttributes(title, { categoryHint: typeof o.category === 'string' ? o.category : null });
  const net = a.connectivity?.includes('5g') ? '5g' : a.connectivity?.includes('4g') ? '4g' : null;
  return {
    storage_gb: a.storageGb ?? null,
    ram_gb: a.ramGb ?? null,
    screen_inches: a.screenInches ?? null,
    color: a.color ?? null,
    capacity_kg: a.capacityKg ?? null,
    capacity_l: a.capacityL ?? null,
    network: net,
    edition: a.edition ?? [],
    is_bundle: detectBundle(title).isBundle,
    is_accessory: detectAccessory(title).isAccessory,
    is_refurbished: /\b(resigilat|recondi|refurbished|second hand|renew)/i.test(title),
  };
}

function heuristicCategory(o: Record<string, unknown>) {
  const titles = Array.isArray(o.titles) ? (o.titles as string[]) : [];
  const slug = categorize(titles[0] ?? '', typeof o.breadcrumb === 'string' ? o.breadcrumb : null);
  return { category: slug, confidence: slug ? 0.8 : 0.5, reason: slug ? 'mock: categorizer rules' : 'mock: no rule matched' };
}

export const heuristicResponder: MockResponder = (params): MockBatchOutcome => {
  const blocks = jsonBlocks(userText(params));
  switch (promptKindOf(params)) {
    case 'pair_verify':
      return { json: heuristicPair(blocks[0] ?? {}, blocks[1] ?? {}) };
    case 'attributes':
      return { json: heuristicAttributes(blocks[0] ?? {}) };
    case 'category':
      return { json: heuristicCategory(blocks[0] ?? {}) };
    default:
      return { text: 'unknown prompt', stopReason: 'end_turn' };
  }
};

/** A pair responder from a function of the two parsed blocks (tests). */
export function pairResponder(decide: (offer: Record<string, unknown>, product: Record<string, unknown>) => MockBatchOutcome, fallback: MockResponder = heuristicResponder): MockResponder {
  return (params, ctx) => {
    if (promptKindOf(params) !== 'pair_verify') return fallback(params, ctx);
    const [offer, product] = jsonBlocks(userText(params));
    return decide(offer ?? {}, product ?? {});
  };
}
