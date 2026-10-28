// @pretoscop/icecat: Open Icecat enrichment (M11). Specs and licensed images for the catalogue,
// under Icecat's Open Content Licence. Contract and licence summary: packages/icecat/README.md.
export * from './types';
export { MAX_IMAGES, hasContent, isProductResponse, mapIcecatProduct } from './map';
export {
  ICECAT_CREDIT,
  ICECAT_LINK,
  ICECAT_MISS_SOURCE,
  ICECAT_ROBOTS_DISALLOW_AGENTS,
  ICECAT_SOURCE,
  icecatAttribution,
  icecatImageLicense,
  isIcecatSource,
} from './attribution';
export {
  ICECAT_API_URL,
  createIcecatClient,
  type IcecatClient,
  type IcecatClientOptions,
  type IcecatFetcher,
  type IcecatImageResult,
  type IcecatLookupKey,
  type IcecatLookupResult,
} from './client';
export {
  MemoryIcecatUsage,
  OPEN_ICECAT_MONTHLY_CAP,
  monthStart,
  usageKey,
  type IcecatUsageStore,
} from './usage';
export {
  BASE_MAX,
  DERIVATIVE_SIZES,
  icecatImageKeys,
  imageInfo,
  makeDerivatives,
  type DerivativeSize,
  type ImageDerivatives,
  type ImageKeys,
} from './images';
