/**
 * Prints the offers a parser extracts from a fixture.
 *   pnpm --filter @pretoscop/extractors demo fixtures/emag/listing_2026-10-27.html [parserKey]
 * The parser is guessed from the file name (shop folder + listing/product/feed) unless given.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseFeed, parsePageDetailed, type RawOffer } from '../index';

const [, , fileArg, parserArg] = process.argv;
if (!fileArg) {
  console.error('usage: demo <fixture file> [parserKey]');
  process.exit(2);
}
const file = resolve(process.env.INIT_CWD ?? process.cwd(), fileArg);
const alt = resolve(process.cwd(), fileArg);
const path = existsSync(file) ? file : alt;
const shop = basename(dirname(path));
const name = basename(path);
const metaPath = `${path}.meta.json`;
const meta = existsSync(metaPath)
  ? (JSON.parse(readFileSync(metaPath, 'utf8')) as { url: string; final_url?: string; recorded_at: string })
  : { url: `https://${shop}.example/`, recorded_at: new Date().toISOString() };
/** Shop folders with their own listing parser (M10); product pages use the generic parser. */
const LISTING_PARSERS: Record<string, string> = {
  itgalaxy: 'itgalaxy-listing',
  dedeman: 'dedeman-listing',
  carrefour: 'carrefour-listing',
  auchan: 'vtex-listing',
  bonami: 'bonami-listing',
};

function guess(): string {
  if (parserArg) return parserArg;
  if (shop === 'emag') return name.startsWith('product') ? 'emag-product' : 'emag-listing';
  if (shop === 'flip' && name.startsWith('product')) return 'flip-product';
  if (name.startsWith('listing') && LISTING_PARSERS[shop]) return LISTING_PARSERS[shop];
  if (name.startsWith('2performant') && name.endsWith('.csv')) return 'feed-2performant-csv';
  if (name.startsWith('2performant')) return 'feed-2performant-xml';
  if (name.startsWith('google')) return 'feed-google-shopping';
  if (name.startsWith('compari')) return 'feed-compari-xml';
  if (name.endsWith('.csv')) return 'feed-csv-generic';
  return 'jsonld-product';
}

const parser = guess();
const body = readFileSync(path, 'utf8');
let offers: RawOffer[];
let extra = '';
if (parser.startsWith('feed-')) {
  offers = [];
  for await (const o of parseFeed(parser, body, { shopSlug: shop, observedAt: meta.recorded_at })) offers.push(o);
} else {
  const res = parsePageDetailed(parser, body, { url: meta.final_url ?? meta.url, shopSlug: shop, observedAt: meta.recorded_at });
  offers = res.offers;
  extra = `next page: ${res.nextPageUrl ?? '—'}  meta: ${JSON.stringify(res.meta)}`;
}

const cut = (s: string | undefined, n: number) => (s ?? '').length > n ? `${(s ?? '').slice(0, n - 1)}…` : (s ?? '').padEnd(n);
console.log(`${name} → parser ${parser}: ${offers.length} offers ${extra}`);
console.log(`${'id'.padEnd(12)} ${'title'.padEnd(60)} ${'price'.padStart(14)} ${'old'.padStart(14)} ${'stock'.padEnd(18)} ${'mpn / seller'}`);
for (const o of offers) {
  console.log(
    `${cut(o.externalId, 12)} ${cut(o.title, 60)} ${o.price.padStart(14)} ${(o.oldPrice ?? '').padStart(14)} ${cut(o.availability, 18)} ${o.mpn ?? ''}${o.sellerName ? ` / ${o.sellerName}` : ''}`,
  );
}
