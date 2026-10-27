import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RawOffer } from '../src/index';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));

export function fixture(path: string): string {
  return readFileSync(root + path, 'utf8');
}

export function fixtureMeta(path: string): { url: string; recorded_at: string } {
  return JSON.parse(readFileSync(`${root}${path}.meta.json`, 'utf8')) as { url: string; recorded_at: string };
}

export async function collect(it: AsyncIterable<RawOffer>): Promise<RawOffer[]> {
  const out: RawOffer[] = [];
  for await (const o of it) out.push(o);
  return out;
}

/** Compact view used in snapshots: the fields a reviewer actually checks. */
export function summary(o: RawOffer): Record<string, unknown> {
  const { shopSlug, externalId, title, price, priceFormat, oldPrice, availability, mpn, mpnHint, gtin, brand, sellerName, isMarketplaceSeller, condition } = o;
  return { shopSlug, externalId, title, price, priceFormat, oldPrice, availability, mpn, mpnHint, gtin, brand, sellerName, isMarketplaceSeller, condition };
}
