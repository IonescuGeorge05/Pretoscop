// Pure domain logic (no I/O). Filled by M06 (normalization), M07 (matching), M08 (verdicts).
// Everything here is safe for browser bundles. The SHA-256 content hash uses Node crypto and is
// exported only from the sub-path `@pretoscop/core/hash`.
export type { RawOffer } from './raw-offer';

// Money and prices (integer bani everywhere)
export {
  type Bani,
  MAX_NUMERIC_12_2_BANI,
  isBani,
  baniToDecimalString,
  decimalStringToBani,
  leiToBani,
  formatLei,
  type FormatLeiOptions,
  sumBani,
  mulDivRound,
} from './money';
export {
  type PriceFormat,
  type PriceRejectReason,
  type PriceFlag,
  type ParsedAmount,
  type PriceParseError,
  type AmountParseResult,
  type ParsedPriceRon,
  type PriceRonParseResult,
  type ParsePriceOptions,
  PLACEHOLDER_MIN_MINOR,
  BELOW_MIN_MINOR,
  SUSPICIOUS_HIGH_MINOR,
  normalizeCurrencyCode,
  detectVatMention,
  parsePrice,
  parsePriceRon,
  parseShippingCost,
  vatRateAt,
  grossUpVat,
  convertToRonBani,
} from './price';
export {
  type ShippingRules,
  type ShippingBasis,
  type TotalPriceInput,
  type TotalPriceResult,
  totalPrice,
} from './pricing';
export {
  type ContentHashFields,
  type ContentHasher,
  CONTENT_HASH_VERSION,
  contentHashInput,
} from './content-hash';

// Text
export {
  normalizeText,
  asciiFold,
  foldLower,
  slugify,
  cleanTitle,
  cleanTitleDetailed,
  type CleanedTitle,
  titleForMatch,
  matchTokens,
  isHexJunkTitle,
  SHOP_TITLE_SUFFIXES,
  SHOP_TITLE_SUFFIXES_DOT_RO_ONLY,
} from './text';
export {
  type ScreenContext,
  screenContextOf,
  cmToScreenInches,
  TV_SIZES_IN,
  MONITOR_SIZES_IN,
} from './units';

// Identifiers
export {
  type GtinQuality,
  type GtinReason,
  type GtinKind,
  type GtinResult,
  type ValidateGtinOptions,
  KNOWN_FAKE_GTINS,
  gtinCheckDigit,
  isValidGtinCheckDigit,
  validateGtin,
  normalizeGtin,
  extractGtins,
  summarizeGtins,
} from './gtin';
export {
  type MpnCandidate,
  type ExtractMpnOptions,
  normalizeMpn,
  extractMpnCandidates,
} from './mpn';
export {
  type Brand,
  type BrandMatch,
  type BrandVia,
  BRANDS,
  brandTokens,
  brandDictionaryIssues,
  findBrand,
  isPlaceholderBrand,
  detectBrand,
  detectBrandInTitle,
} from './brands';
export { type BrandSeed, type LineSeed, BRAND_SEEDS } from './brands-data';
export { type UnknownBrandGuess, type UnknownBrandRule, guessUnknownBrand } from './unknown-brand';

// Attributes and flags
export {
  type ProductKind,
  type ProductKindExplained,
  type ProductKindVia,
  categoryKind,
  detectProductKind,
  explainProductKind,
  isAccessoryKind,
  lineKind,
} from './product-kind';
export {
  type Attributes,
  type ColorKey,
  type Resolution,
  type Connectivity,
  type Edition,
  type ExtractAttributesOptions,
  COLOR_LABELS_RO,
  colorKeyOf,
  extractAttributes,
} from './attributes';
export {
  type Condition,
  type ConditionDetail,
  type ConditionResult,
  detectCondition,
} from './condition';
export { type BundleKind, type BundleResult, detectBundle } from './bundle';
export { type AccessoryResult, detectAccessory } from './accessory';
export { type Availability, mapAvailability } from './availability';

// Offer normalization
export {
  type RejectReason,
  type NormalizeShopContext,
  type NormalizeContext,
  type AcceptedOffer,
  type RejectedOffer,
  type NormalizedOffer,
  isAcceptedOffer,
  normalizeOffer,
} from './normalize';
