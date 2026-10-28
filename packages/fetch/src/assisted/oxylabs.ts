import type { AssistedClient } from './types';

export interface OxylabsClientOptions {
  username: string;
  password: string;
}

/**
 * Second vendor behind the same `AssistedClient` interface (plan M05B: "an adapter stub").
 * Oxylabs Web Unblocker (oxylabs UAB, Vilnius) is a proxy endpoint (`unblock.oxylabs.io:60000`)
 * that bills per GB; wiring it needs a proxy dispatcher, its `x-oxylabs-*` headers for rendering
 * and geolocation, and recorded responses for the mapping tests. Until a founder chooses it
 * (`ASSISTED_VENDOR=oxylabs`, setup A10), every call fails clearly instead of half-working.
 */
export function createOxylabsClient(opts: OxylabsClientOptions): AssistedClient {
  if (!opts.username || !opts.password) throw new Error('createOxylabsClient: OXYLABS_USERNAME and OXYLABS_PASSWORD are required');
  return {
    vendor: 'oxylabs',
    async fetch(url) {
      return {
        outcome: 'error',
        billable: false,
        vendorStatus: 0,
        status: 0,
        body: null,
        finalUrl: url,
        error: 'the Oxylabs adapter is a stub (not implemented yet); use ASSISTED_VENDOR=zyte',
      };
    },
  };
}
