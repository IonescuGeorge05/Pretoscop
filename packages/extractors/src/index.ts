export type { RawOffer } from '@pretoscop/core';
export type {
  FeedContext,
  FeedInput,
  FeedParser,
  PageContext,
  PageParseResult,
  PageParser,
  SitemapEntry,
  SitemapParseResult,
} from './types';
export {
  PAGE_PARSERS,
  FEED_PARSERS,
  DISCOVERY_PARSERS,
  allParserKeys,
  isKnownParserKey,
  parseFeed,
  parsePage,
  parsePageDetailed,
  registerPageParser,
} from './registry';
export { parseSitemap } from './sitemap';
export { emagPnk, emagSlugMpn, EMAG_VENDOR_ID } from './shops/emag';
export { structuredProducts, sdToRawOffer } from './structured/generic';
export type { SdOffer, SdProduct } from './structured/jsonld';
export { canonicalUrl, absoluteUrl, slugLike } from './util';
