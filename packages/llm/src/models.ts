/**
 * Models we call and their list prices (ADR-011, ADR-022). Costs are integers in nano-US-dollars
 * (1 USD = 1e9 n$) so a ledger of many sub-cent calls sums exactly; prices are n$ per 1,000
 * tokens so the batch discount and cache multipliers stay integers too.
 *
 * Source: Anthropic list prices as published in the claude-api reference (model table cached
 * 2026-10-06): Claude Haiku 5.5 $0.10 / $0.50 per million input / output tokens for prompts up to
 * 100K tokens ($0.50 / $2.50 above), Claude Sonnet 5.5 $2 / $10. Cache reads cost 0.1× the input
 * price, 5-minute cache writes 1.25×, 1-hour cache writes 2×. The Message Batches API bills 50 %
 * of all token usage. Re-check the pricing page before enabling the flag (docs/13 open items).
 */
export const PRICES_AS_OF = '2026-10-06';

export interface RateCard {
  /** n$ per 1,000 uncached input tokens. */
  input: number;
  /** n$ per 1,000 output tokens (thinking tokens included: they are billed as output). */
  output: number;
}

export interface ModelPrice {
  model: string;
  label: string;
  standard: RateCard;
  /** A second rate card for long prompts (Haiku 5.5: above 100K prompt tokens). */
  longContext?: { aboveInputTokens: number; card: RateCard };
}

/** $ per million tokens → n$ per 1,000 tokens. */
const perMTok = (usd: number): number => Math.round(usd * 1_000_000);

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-haiku-5-5': {
    model: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    standard: { input: perMTok(0.1), output: perMTok(0.5) },
    longContext: { aboveInputTokens: 100_000, card: { input: perMTok(0.5), output: perMTok(2.5) } },
  },
  'claude-sonnet-5-5': {
    model: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    standard: { input: perMTok(2), output: perMTok(10) },
  },
};

/** Multipliers on the input price (as fractions over 100 to stay in integers). */
export const CACHE_READ_PCT = 10;
export const CACHE_WRITE_5M_PCT = 125;
export const CACHE_WRITE_1H_PCT = 200;
export const BATCH_PCT = 50;

export class UnknownModelError extends Error {
  constructor(model: string) {
    super(`no price for model "${model}": add it to packages/llm/src/models.ts before calling it`);
    this.name = 'UnknownModelError';
  }
}

export function priceOf(model: string): ModelPrice {
  const p = MODEL_PRICES[model];
  if (!p) throw new UnknownModelError(model);
  return p;
}

/** Token counts as the API reports them in `usage` (any field may be absent or null). */
export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
}

export const ZERO_USAGE: UsageTokens = { inputTokens: 0, outputTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0 };

/** Shape of the API's `usage` object (Messages API and batch results). */
export interface ApiUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

/**
 * Normalizes the API's usage. When the TTL breakdown is missing, cache writes are priced as
 * 1-hour writes (the dearer kind: never under-counts).
 */
export function usageFromApi(u: ApiUsageLike | null | undefined): UsageTokens {
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const writes = n(u?.cache_creation_input_tokens);
  const w5 = n(u?.cache_creation?.ephemeral_5m_input_tokens);
  const w1 = n(u?.cache_creation?.ephemeral_1h_input_tokens);
  const breakdownKnown = u?.cache_creation != null && w5 + w1 === writes;
  return {
    inputTokens: n(u?.input_tokens),
    outputTokens: n(u?.output_tokens),
    cacheWrite5mTokens: breakdownKnown ? w5 : 0,
    cacheWrite1hTokens: breakdownKnown ? w1 : writes,
    cacheReadTokens: n(u?.cache_read_input_tokens),
  };
}

function cardFor(price: ModelPrice, promptTokens: number): RateCard {
  return price.longContext && promptTokens > price.longContext.aboveInputTokens ? price.longContext.card : price.standard;
}

/** ceil(tokens × rate / 1000 × pct / 100) without floating point. */
function part(tokens: number, ratePerK: number, pct: number): number {
  if (tokens <= 0) return 0;
  return Math.ceil((tokens * ratePerK * pct) / 100_000);
}

/** Cost of one call in n$ (rounded up per component). */
export function costUsdNanos(model: string, usage: UsageTokens, opts: { batch: boolean }): number {
  const price = priceOf(model);
  const prompt = usage.inputTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens + usage.cacheReadTokens;
  const card = cardFor(price, prompt);
  const b = opts.batch ? BATCH_PCT : 100;
  return (
    part(usage.inputTokens, card.input, b) +
    part(usage.cacheReadTokens, card.input, (CACHE_READ_PCT * b) / 100) +
    part(usage.cacheWrite5mTokens, card.input, (CACHE_WRITE_5M_PCT * b) / 100) +
    part(usage.cacheWrite1hTokens, card.input, (CACHE_WRITE_1H_PCT * b) / 100) +
    part(usage.outputTokens, card.output, b)
  );
}

/**
 * Worst case of one call before it is sent: every prompt token billed as a 1-hour cache write
 * (the dearest input kind), `maxTokens` output tokens, the long-context card when the bound passes
 * its threshold. The budget reserves this amount, so the cap holds while calls are in flight.
 */
export function worstCaseUsdNanos(model: string, opts: { maxInputTokens: number; maxTokens: number; batch: boolean }): number {
  const price = priceOf(model);
  const card = cardFor(price, opts.maxInputTokens);
  const b = opts.batch ? BATCH_PCT : 100;
  return part(opts.maxInputTokens, card.input, (CACHE_WRITE_1H_PCT * b) / 100) + part(opts.maxTokens, card.output, b);
}

/** n$ → n€ at `eurPerUsd`, rounded up. */
export function usdToEurNanos(usdNanos: number, eurPerUsd: number): number {
  if (!(eurPerUsd > 0)) throw new Error(`invalid EUR/USD rate ${eurPerUsd}`);
  return Math.ceil(usdNanos * eurPerUsd);
}

export const NANOS = 1_000_000_000;

/** n€ or n$ as a decimal string with `digits` decimals (display only). */
export function formatNanos(nanos: number, digits = 2): string {
  return (nanos / NANOS).toFixed(digits);
}
