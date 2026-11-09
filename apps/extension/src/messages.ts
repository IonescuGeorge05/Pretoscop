import type { PageIds } from './identifiers';
import type { LookupData } from './lookup-data';
import type { ShopId } from './shops';

/** The only message the extension exchanges: content script → background worker, same extension. */
export const LOOKUP_MESSAGE = 'pretoscop/lookup';

export interface LookupRequest {
  type: typeof LOOKUP_MESSAGE;
  shop: ShopId;
  ids: PageIds;
}

export type LookupFailure = 'not_found' | 'disabled' | 'rate_limited' | 'unavailable' | 'invalid';

export type LookupReply = { ok: true; data: LookupData } | { ok: false; reason: LookupFailure };
