import type { AssistedPricing } from './types';

/**
 * Zyte API pay-as-you-go prices, US cents per 1,000 successful responses, per site tier
 * (zyte.com/pricing, read 2026-10-27; docs/research/notes/gaps2_technical.md A1). Zyte assigns
 * each domain a tier itself; the designated shops' tiers are not public, so a shop without
 * `crawl_policy.assisted_tier` is priced at tier 5 (the dearest): the ledger then overestimates,
 * which is the safe side of a hard cap. Commitment plans are cheaper; the cap stays conservative.
 */
export const ZYTE_PAYG_USD_CENTS_PER_1K = {
  http: [13, 23, 44, 70, 127],
  browser: [101, 201, 402, 804, 1608],
} as const;

export type ZyteTier = 1 | 2 | 3 | 4 | 5;

export const DEFAULT_ZYTE_TIER: ZyteTier = 5;

/** EUR per USD used for the estimate (BNR: 1 EUR = 1.1148 USD on 2026-10-27, rounded up). */
export const DEFAULT_EUR_PER_USD = 0.9;

/** Tier → EUR cents per 1,000 billable responses, rounded up. */
export function zytePricing(tier: number = DEFAULT_ZYTE_TIER, eurPerUsd: number = DEFAULT_EUR_PER_USD): AssistedPricing {
  const t = Number.isInteger(tier) && tier >= 1 && tier <= 5 ? tier : DEFAULT_ZYTE_TIER;
  const rate = Number.isFinite(eurPerUsd) && eurPerUsd > 0 ? eurPerUsd : DEFAULT_EUR_PER_USD;
  return {
    httpCentsPer1k: Math.ceil(ZYTE_PAYG_USD_CENTS_PER_1K.http[t - 1]! * rate),
    renderCentsPer1k: Math.ceil(ZYTE_PAYG_USD_CENTS_PER_1K.browser[t - 1]! * rate),
  };
}

/**
 * Cost of one ledger row (day × shop × vendor) in EUR cents, from its counters: billable responses
 * at the HTTP price, of which at most `renderedRequests` at the browser price; rounded up. Exact
 * when a shop uses one tier all day (the normal case), an upper bound otherwise.
 */
export function ledgerRowCostCents(row: { successes: number; renderedRequests: number }, pricing: AssistedPricing): number {
  const billed = Math.max(0, row.successes);
  const rendered = Math.min(Math.max(0, row.renderedRequests), billed);
  return Math.ceil((billed * pricing.httpCentsPer1k + rendered * (pricing.renderCentsPer1k - pricing.httpCentsPer1k)) / 1000);
}
