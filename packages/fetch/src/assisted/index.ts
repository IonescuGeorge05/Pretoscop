// Assisted-access channel (M05B, ADR-015): vendor clients, cost ledger, monthly cap.
// Only `fetchPolite` reaches it (FetcherDeps.assisted); see packages/fetch/README.md.

export type {
  AssistedClient,
  AssistedClientRequest,
  AssistedClientResponse,
  AssistedPricing,
  AssistedShopSettings,
  AssistedVendorName,
  VendorOutcome,
} from './types';
export {
  createAssistedChannel,
  type AssistedChannelHandle,
  type AssistedChannelOptions,
  type AssistedCheckContext,
  type AssistedRefusal,
} from './channel';
export { MemoryAssistedLedger, type AssistedLedger, type AssistedLedgerEntry, type LedgerRow } from './ledger';
export {
  DEFAULT_EUR_PER_USD,
  DEFAULT_ZYTE_TIER,
  ZYTE_PAYG_USD_CENTS_PER_1K,
  ledgerRowCostCents,
  zytePricing,
  type ZyteTier,
} from './pricing';
export { ZYTE_API_URL, createZyteClient, mapZyteAnswer, zyteRequestBody, type ZyteClientOptions } from './zyte';
export { createOxylabsClient, type OxylabsClientOptions } from './oxylabs';
