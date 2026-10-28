import { attributesV1 } from './attributes';
import { categoryV1 } from './category';
import { pairVerifyV1 } from './pair-verify';
import type { PromptDef } from './types';

export { type AttributesInput, type ExtractedAttributes, attributesV1, COLOR_KEYS, EDITION_KEYS } from './attributes';
export { type CategoryInput, type CategorySuggestion, CATEGORY_SLUGS, categoryV1 } from './category';
export { type PairInput, type PairVerdict, pairVerifyV1 } from './pair-verify';
export { InvalidOutputError, type PromptDef } from './types';

/** The prompts new requests use. */
export const PROMPTS = { pairVerify: pairVerifyV1, attributes: attributesV1, category: categoryV1 } as const;

/** Every version that may still have answers to read (batches in flight, stored results). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: ReadonlyArray<PromptDef<any, unknown>> = [pairVerifyV1, attributesV1, categoryV1];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function promptByVersion(id: string, version: string): PromptDef<any, unknown> | undefined {
  return REGISTRY.find((p) => p.id === id && p.version === version);
}

export function allPromptVersions(): Array<{ id: string; version: string }> {
  return REGISTRY.map((p) => ({ id: p.id, version: p.version }));
}
