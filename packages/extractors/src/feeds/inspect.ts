import type { RawOffer } from '@pretoscop/core';
import { parseFeed } from '../registry';
import type { FeedInput } from '../types';
import { textChunks } from './stream';

/**
 * Feed inspection for the merchant portal (M20): which format a feed is in, what a sample of it
 * contains, and what will go wrong at ingestion. Pure except for reading the given body; the
 * worker fetches the feed and adds normalization results (`@pretoscop/core`).
 */

export type FeedFormat = 'google' | 'compari' | 'csv';

/** `shop_sources.parser_key` for each format the portal accepts. */
export const FEED_PARSER_FOR_FORMAT: Record<FeedFormat, string> = {
  google: 'feed-google-shopping',
  compari: 'feed-compari-xml',
  csv: 'feed-csv-generic',
};

/** Item elements of each XML format (for counting rows the mapper could not use). */
const XML_ITEM_RE: Record<Exclude<FeedFormat, 'csv'>, RegExp> = {
  google: /<(item|entry)[\s>]/gi,
  compari: /<product[\s>]/gi,
};

/** Recognizes a feed from its first bytes; null when it is none of the accepted formats. */
export function detectFeedFormat(head: string): FeedFormat | null {
  const s = head.replace(/^﻿/, '').trimStart();
  if (s.startsWith('<')) {
    if (/xmlns:g\s*=|<g:[a-z_]+[\s>]/i.test(s)) return 'google';
    if (/<products?[\s>]/i.test(s) && /<(identifier|producturl|name|price)[\s>]/i.test(s)) return 'compari';
    return null;
  }
  const firstLine = s.split(/\r?\n/, 1)[0] ?? '';
  const delimiters = [',', ';', '\t', '|'].map((d) => firstLine.split(d).length - 1);
  return Math.max(...delimiters) >= 2 ? 'csv' : null;
}

export type FieldKey =
  | 'gtin'
  | 'mpn'
  | 'brand'
  | 'category'
  | 'oldPrice'
  | 'availability'
  | 'condition'
  | 'shippingCost'
  | 'shippingNote'
  | 'imageUrl'
  | 'vatIncluded'
  | 'currency';

const FIELD_KEYS: FieldKey[] = ['gtin', 'mpn', 'brand', 'category', 'oldPrice', 'availability', 'condition', 'shippingCost', 'shippingNote', 'imageUrl', 'vatIncluded', 'currency'];

export type PriceFormatVerdict = 'decimal' | 'ro' | 'ambiguous' | 'mixed' | 'none';

export interface FeedInspection {
  format: FeedFormat;
  parserKey: string;
  /** Offers the mapper produced (up to `limit`). */
  offers: number;
  /** True when the sample stopped at `limit`. */
  truncated: boolean;
  /** Item elements / data lines seen in the inspected text (≥ offers; the difference had no title, URL or price). */
  rows: number;
  /** Rows the mapper skipped for lack of a title, a product URL or a price. */
  skippedRows: number;
  /** How many offers carry each optional field. */
  fields: Record<FieldKey, number>;
  /** How prices are written: decimal ("2199.99"), Romanian ("2.199,99"), ambiguous ("12.500"). */
  priceFormat: { verdict: PriceFormatVerdict; ambiguousExamples: string[] };
  vat: { included: number; excluded: number; unknown: number };
  currencies: Record<string, number>;
  /** Product URLs on `domain` (or a subdomain); examples of the others. */
  domain: { expected: string | null; onDomain: number; offDomain: number; offDomainExamples: string[] };
  duplicateIds: number;
  /** Parser failure (malformed XML or CSV); the stats cover what was read before it. */
  parseError: string | null;
  /** The first offers, for the preview (at most `sampleSize`). */
  sample: RawOffer[];
  /** All inspected offers (at most `limit`), for normalization statistics. */
  all: RawOffer[];
}

export interface InspectOptions {
  format: FeedFormat;
  /** The shop's registrable domain (`magazin.ro`); product URLs elsewhere are counted as off-domain. */
  domain?: string | null;
  limit?: number;
  sampleSize?: number;
  shopSlug?: string;
}

const AMBIGUOUS_RE = /^\d{1,3}(\.\d{3})+$/;
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
const RO_RE = /^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/;

function priceStyle(raw: string): 'decimal' | 'ro' | 'ambiguous' | 'other' {
  const v = raw.replace(/\s|lei|ron/gi, '');
  if (AMBIGUOUS_RE.test(v)) return 'ambiguous';
  if (DECIMAL_RE.test(v)) return 'decimal';
  if (RO_RE.test(v)) return 'ro';
  return 'other';
}

export function hostOnDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    const d = domain.toLowerCase();
    return host === d || host.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

function countRows(text: string, format: FeedFormat): number {
  if (format === 'csv') return Math.max(0, text.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1);
  return (text.match(XML_ITEM_RE[format]) ?? []).length;
}

/** Reads a whole feed body (string or bytes, gzip handled) as text. */
export async function feedText(input: FeedInput): Promise<string> {
  let out = '';
  for await (const chunk of textChunks(input)) out += chunk;
  return out;
}

/**
 * Parses up to `limit` offers with the format's mapper and summarizes them. Never throws on bad
 * input: a parser error ends the sample and is reported in `parseError`.
 */
export async function inspectFeed(text: string, opts: InspectOptions): Promise<FeedInspection> {
  const limit = opts.limit ?? 5000;
  const sampleSize = opts.sampleSize ?? 20;
  const parserKey = FEED_PARSER_FOR_FORMAT[opts.format];
  const all: RawOffer[] = [];
  let truncated = false;
  let parseError: string | null = null;
  try {
    for await (const offer of parseFeed(parserKey, text, { shopSlug: opts.shopSlug ?? 'merchant', observedAt: new Date().toISOString() })) {
      if (all.length >= limit) {
        truncated = true;
        break;
      }
      all.push(offer);
    }
  } catch (err) {
    parseError = (err as Error).message.slice(0, 300);
  }

  const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, 0])) as Record<FieldKey, number>;
  const vat = { included: 0, excluded: 0, unknown: 0 };
  const currencies: Record<string, number> = {};
  const styles = { decimal: 0, ro: 0, ambiguous: 0, other: 0 };
  const ambiguousExamples: string[] = [];
  const ids = new Set<string>();
  let duplicateIds = 0;
  const domain = { expected: opts.domain ?? null, onDomain: 0, offDomain: 0, offDomainExamples: [] as string[] };

  for (const o of all) {
    for (const k of FIELD_KEYS) {
      const v = o[k];
      if (v !== undefined && v !== null && v !== '') fields[k]++;
    }
    if (o.vatIncluded === true) vat.included++;
    else if (o.vatIncluded === false) vat.excluded++;
    else vat.unknown++;
    const cur = (o.currency ?? 'RON').toUpperCase();
    currencies[cur] = (currencies[cur] ?? 0) + 1;
    for (const p of [o.price, o.oldPrice]) {
      if (!p) continue;
      const style = o.priceFormat === 'decimal' ? 'decimal' : priceStyle(p);
      styles[style]++;
      if (style === 'ambiguous' && ambiguousExamples.length < 5 && !ambiguousExamples.includes(p)) ambiguousExamples.push(p);
    }
    if (ids.has(o.externalId)) duplicateIds++;
    ids.add(o.externalId);
    if (opts.domain) {
      if (hostOnDomain(o.url, opts.domain)) domain.onDomain++;
      else {
        domain.offDomain++;
        if (domain.offDomainExamples.length < 5) domain.offDomainExamples.push(o.url);
      }
    }
  }

  // "12.500" alone could be 12.50 (three decimals) or 12 500 (dot thousands). Next to comma
  // decimals ("2.599,00") it is clearly Romanian format; otherwise the merchant must say.
  let verdict: PriceFormatVerdict = 'none';
  if (styles.ro > 0 && styles.decimal > 0) verdict = 'mixed';
  else if (styles.ro > 0) verdict = 'ro';
  else if (styles.ambiguous > 0) verdict = 'ambiguous';
  else if (styles.decimal > 0) verdict = 'decimal';

  const rows = truncated ? all.length : Math.max(all.length, countRows(text, opts.format));
  return {
    format: opts.format,
    parserKey,
    offers: all.length,
    truncated,
    rows,
    skippedRows: truncated ? 0 : Math.max(0, rows - all.length),
    fields,
    priceFormat: { verdict, ambiguousExamples },
    vat,
    currencies,
    domain,
    duplicateIds,
    parseError,
    sample: all.slice(0, sampleSize),
    all,
  };
}
