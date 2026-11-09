import type { PageIds } from './identifiers';
import { parseLookupData, type LookupData } from './lookup-data';
import type { ShopId } from './shops';

/** The only message the extension exchanges: content script → background worker, same extension. */
export const LOOKUP_MESSAGE = 'pretoscop/lookup';

export interface LookupRequest {
  type: typeof LOOKUP_MESSAGE;
  shop: ShopId;
  ids: PageIds;
}

export type LookupFailure = 'not_found' | 'disabled' | 'rate_limited' | 'unavailable' | 'invalid';
const FAILURES = new Set<LookupFailure>(['not_found', 'disabled', 'rate_limited', 'unavailable', 'invalid']);

/**
 * The background worker's answer: the API's JSON body as received (it already passed
 * `parseLookupData` there), or why there is none. The content script parses the body again
 * (`parseReply`) instead of trusting the message: whatever arrives is checked where it is rendered.
 */
export type LookupReply = { ok: true; body: unknown } | { ok: false; reason: LookupFailure };

export type ParsedReply = { ok: true; data: LookupData } | { ok: false; reason: LookupFailure };

/** A reply as the content script accepts it, or null when it is not one. */
export function parseReply(raw: unknown): ParsedReply | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.ok === true) {
    const data = parseLookupData(r.body);
    return data ? { ok: true, data } : null;
  }
  if (r.ok === false && FAILURES.has(r.reason as LookupFailure)) return { ok: false, reason: r.reason as LookupFailure };
  return null;
}
