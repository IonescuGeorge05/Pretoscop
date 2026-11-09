import { costUsdNanos, type UsageTokens } from './models';
import type { PreparedRequest } from './request';

/**
 * Planning estimates from the price table, before any call (dry runs, mock runs). Tokens are
 * guessed at 3.5 UTF-8 bytes each; the real figures come from the ledger after a run with a key.
 */
export const EST_BYTES_PER_TOKEN = 3.5;
/** Output guess of a pair answer: the JSON (~60 tokens) plus low-effort thinking. */
export const EST_OUTPUT_TOKENS = 150;

export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / EST_BYTES_PER_TOKEN);
}

export interface CostEstimate {
  requests: number;
  usdNanos: number;
  /** Requests whose shared prefix is assumed to be read from the cache. */
  cachedRequests: number;
}

/**
 * Cost of sending `reqs` (each prefix written to the 1-hour cache once, then read by the others of
 * the same prefix — best effort inside batches, so this is the optimistic end).
 */
export function estimateCost(reqs: PreparedRequest[], opts: { batch: boolean; outputTokens?: number }): CostEstimate {
  const seen = new Set<string>();
  let usd = 0;
  let cached = 0;
  for (const r of reqs) {
    const system = Array.isArray(r.params.system) ? r.params.system.map((b) => b.text).join('') : (r.params.system ?? '');
    const rest = JSON.stringify(r.params.messages) + JSON.stringify(r.params.output_config ?? {});
    const sys = estimateTokens(system);
    const hit = seen.has(r.prefixKey);
    seen.add(r.prefixKey);
    if (hit) cached++;
    const usage: UsageTokens = {
      inputTokens: estimateTokens(rest),
      outputTokens: opts.outputTokens ?? EST_OUTPUT_TOKENS,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: hit ? 0 : sys,
      cacheReadTokens: hit ? sys : 0,
    };
    usd += costUsdNanos(r.model, usage, { batch: opts.batch });
  }
  return { requests: reqs.length, usdNanos: usd, cachedRequests: cached };
}
