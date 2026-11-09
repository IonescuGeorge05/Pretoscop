import type { CallMeta, LlmClient } from './client';
import type { RawSide } from './guard';
import { NANOS } from './models';
import { attributesV1, type AttributesInput, categoryV1, type CategoryInput, type CategorySuggestion, type ExtractedAttributes, pairVerifyV1, type PairVerdict } from './prompts';
import { prepare, type Route } from './request';

/** The plan's interface contract (M22): synchronous helpers over the client. Bulk work uses batches. */

export interface Cost {
  usageId: number;
  model: string;
  eur: number;
  usd: number;
}

function cost(r: { usageId: number; model: string; costEurNanos: number; costUsdNanos: number }): Cost {
  return { usageId: r.usageId, model: r.model, eur: r.costEurNanos / NANOS, usd: r.costUsdNanos / NANOS };
}

export class LlmAnswerError extends Error {
  constructor(
    message: string,
    readonly cost: Cost,
  ) {
    super(message);
    this.name = 'LlmAnswerError';
  }
}

/** `verifyPair(offer, product) → {same, confidence, reason, cost}` */
export async function verifyPair(
  llm: LlmClient,
  offer: RawSide,
  product: RawSide,
  route: Route,
  meta: CallMeta = { purpose: 'match.verify' },
): Promise<PairVerdict & { cost: Cost }> {
  const req = prepare(pairVerifyV1, route, { offer, product });
  const r = await llm.call(pairVerifyV1, req, meta);
  if (!r.answer.ok) throw new LlmAnswerError(`verifyPair: ${r.answer.error}`, cost(r));
  return { ...r.answer.value, cost: cost(r) };
}

/** `extractAttributes(title) → Attributes` (the hard attributes of M07 plus bundle/accessory/refurbished flags). */
export async function extractAttributes(
  llm: LlmClient,
  input: AttributesInput,
  route: Route,
  meta: CallMeta = { purpose: 'attributes.extract' },
): Promise<ExtractedAttributes & { cost: Cost }> {
  const req = prepare(attributesV1, route, input);
  const r = await llm.call(attributesV1, req, meta);
  if (!r.answer.ok) throw new LlmAnswerError(`extractAttributes: ${r.answer.error}`, cost(r));
  return { ...r.answer.value, cost: cost(r) };
}

/** A category of our taxonomy for an unmapped shop category (a suggestion for the founders). */
export async function suggestCategory(
  llm: LlmClient,
  input: CategoryInput,
  route: Route,
  meta: CallMeta = { purpose: 'category.suggest' },
): Promise<CategorySuggestion & { cost: Cost }> {
  const req = prepare(categoryV1, route, input);
  const r = await llm.call(categoryV1, req, meta);
  if (!r.answer.ok) throw new LlmAnswerError(`suggestCategory: ${r.answer.error}`, cost(r));
  return { ...r.answer.value, cost: cost(r) };
}
