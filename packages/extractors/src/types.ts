import type { RawOffer } from '@pretoscop/core';

export type { RawOffer };

export interface PageContext {
  /** URL the HTML was fetched from (after redirects). */
  url: string;
  shopSlug: string;
  /** ISO timestamp of the fetch; copied into every RawOffer. */
  observedAt: string;
}

export interface PageParseResult {
  offers: RawOffer[];
  /** Product page URLs seen on a listing (discovery, Tier A selection). */
  productUrls?: string[];
  /** Next listing page, when the page links to it. */
  nextPageUrl?: string | null;
  /** Diagnostics: counts, skipped cards, warnings. Never personal data. */
  meta?: Record<string, unknown>;
}

export type PageParser = (html: string, ctx: PageContext) => PageParseResult;

export interface FeedContext {
  shopSlug: string;
  observedAt: string;
  feedUrl?: string;
}

/** A feed body: a whole string/buffer, or a stream of chunks (gzip is detected and inflated). */
export type FeedInput = AsyncIterable<Uint8Array | string> | Uint8Array | string;

export type FeedParser = (input: FeedInput, ctx: FeedContext) => AsyncIterable<RawOffer>;

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export interface SitemapParseResult {
  /** `<urlset>` entries. */
  urls: SitemapEntry[];
  /** `<sitemapindex>` children (URLs of further sitemaps). */
  children: string[];
}
