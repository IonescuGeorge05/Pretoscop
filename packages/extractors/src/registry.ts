import type { RawOffer } from '@pretoscop/core';
import {
  parse2PerformantCsv,
  parse2PerformantXml,
  parseCompariXml,
  parseGenericCsv,
  parseGoogleShopping,
} from './feeds/mappers';
import { parseBonamiListing } from './shops/bonami';
import { parseCarrefourListing } from './shops/carrefour';
import { parseDedemanListing } from './shops/dedeman';
import { parseEmagListing, parseEmagProduct } from './shops/emag';
import { parseFlipProduct } from './shops/flip';
import { parseItGalaxyListing } from './shops/itgalaxy';
import { parseVtexListing } from './shops/vtex';
import { parseStructuredProductPage } from './structured/generic';
import type { FeedContext, FeedInput, FeedParser, PageContext, PageParseResult, PageParser } from './types';

/** Page parsers keyed by `shop_sources.parser_key`. */
export const PAGE_PARSERS: Record<string, PageParser> = {
  'jsonld-product': parseStructuredProductPage,
  'emag-listing': parseEmagListing,
  'emag-product': parseEmagProduct,
  // M10 adapters (listing pages first: many offers per polite request).
  'itgalaxy-listing': parseItGalaxyListing,
  'dedeman-listing': parseDedemanListing,
  'carrefour-listing': parseCarrefourListing,
  'vtex-listing': parseVtexListing,
  'bonami-listing': parseBonamiListing,
  'flip-product': parseFlipProduct,
};

/** Feed parsers keyed by `shop_sources.parser_key`. */
export const FEED_PARSERS: Record<string, FeedParser> = {
  'feed-2performant-csv': parse2PerformantCsv,
  'feed-2performant-xml': parse2PerformantXml,
  'feed-google-shopping': parseGoogleShopping,
  'feed-compari-xml': parseCompariXml,
  'feed-csv-generic': parseGenericCsv,
};

/**
 * Discovery-only keys: the source yields URLs (sitemaps), which the recorder then fetches with
 * the page parser named in the source config (`config.productParser`).
 */
export const DISCOVERY_PARSERS = ['sitemap'] as const;

export function registerPageParser(key: string, parser: PageParser): void {
  PAGE_PARSERS[key] = parser;
}

export function isKnownParserKey(key: string): boolean {
  return key in PAGE_PARSERS || key in FEED_PARSERS || (DISCOVERY_PARSERS as readonly string[]).includes(key);
}

export function allParserKeys(): string[] {
  return [...Object.keys(PAGE_PARSERS), ...Object.keys(FEED_PARSERS), ...DISCOVERY_PARSERS].sort();
}

export function parsePageDetailed(parserKey: string, html: string, ctx: PageContext): PageParseResult {
  const parser = PAGE_PARSERS[parserKey];
  if (!parser) throw new Error(`unknown page parser: ${parserKey}`);
  return parser(html, ctx);
}

/** Contract of M03: `parsePage(parserKey, html, url) → RawOffer[]`. */
export function parsePage(
  parserKey: string,
  html: string,
  url: string,
  ctx: Partial<Omit<PageContext, 'url'>> = {},
): RawOffer[] {
  return parsePageDetailed(parserKey, html, {
    url,
    shopSlug: ctx.shopSlug ?? new URL(url).hostname.replace(/^www\./, '').split('.')[0] ?? 'unknown',
    observedAt: ctx.observedAt ?? new Date().toISOString(),
  }).offers;
}

/** Contract of M03: `parseFeed(parserKey, stream) → AsyncIterable<RawOffer>`. */
export function parseFeed(parserKey: string, input: FeedInput, ctx: FeedContext): AsyncIterable<RawOffer> {
  const parser = FEED_PARSERS[parserKey];
  if (!parser) throw new Error(`unknown feed parser: ${parserKey}`);
  return parser(input, ctx);
}
