import type { AssistedFetchResponse } from '../types';

/**
 * Assisted-access channel (M05B, ADR-015, docs/12-blocked-shops-strategy.md §0 and layer 2b).
 * A commercial data-collection service reads the public pages of the founder-designated shops
 * that refuse unknown bots. The vendor handles the shop's anti-bot measures on its side; we
 * never operate stealth browsers, proxy pools or solvers, and never send impersonating headers.
 * Everything else (robots.txt, per-domain interval, budgets, windows, pauses, request log) is the
 * fetch layer's, unchanged: the channel is only reached through `fetchPolite`.
 */

export type AssistedVendorName = 'zyte' | 'oxylabs';

/** How a vendor call ended, from the vendor's side (the fetch layer still scans the body). */
export type VendorOutcome =
  /** The vendor returned the shop's response (any shop status: 200, 301, 404 ...). Billed. */
  | 'success'
  /** The vendor could not get past the shop's protection (Zyte 520). Not billed. */
  | 'blocked'
  /** No answer in time (Zyte 500 /server/timed-out, or our own deadline). Not billed. */
  | 'timeout'
  /** Vendor rate limit or overload (Zyte 429, 503). Not billed. */
  | 'rate_limited'
  /** The vendor refuses: bad key, suspended account (401/403) or a forbidden domain (451). */
  | 'refused'
  /** Anything else (invalid request, internal error, unreachable domain). Not billed. */
  | 'error';

export interface AssistedClientRequest {
  /** Browser-rendered tier (about ten times the price); the HTTP tier otherwise. */
  render: boolean;
  /** ISO 3166-1 alpha-2 exit country; unset lets the vendor choose (cheaper, no verification). */
  country?: string;
  /** The vendor must answer within this time. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface AssistedClientResponse extends AssistedFetchResponse {
  outcome: VendorOutcome;
  /** The vendor bills this call (Zyte bills successful responses only). */
  billable: boolean;
  /** The vendor's own HTTP status (200 when it relayed the shop's response). */
  vendorStatus: number;
  /** The vendor's error type, e.g. `/download/temporary-error`. */
  vendorError?: string;
}

/** One vendor behind one interface, so vendors are swappable (M05B contract). */
export interface AssistedClient {
  readonly vendor: AssistedVendorName;
  fetch(url: string, request: AssistedClientRequest): Promise<AssistedClientResponse>;
}

/** Vendor prices for one shop, in EUR cents per 1,000 billable responses. */
export interface AssistedPricing {
  httpCentsPer1k: number;
  renderCentsPer1k: number;
}

/** Per-shop settings of the channel (shop registry `crawl_policy.assisted_*`). */
export interface AssistedShopSettings {
  pricing: AssistedPricing;
  /** Exit country passed to the vendor; unset = vendor's choice. */
  country?: string;
}
