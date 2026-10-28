import type { Logger } from '@pretoscop/config/logger';
import {
  type Db,
  type IcecatCandidate,
  confirmProvisionalByIcecat,
  deleteIcecatImages,
  icecatCandidates,
  icecatImagesOf,
  insertIcecatImage,
  saveIcecatMiss,
  saveIcecatSpecs,
  setPrimaryImageIfMissing,
} from '@pretoscop/db';
import {
  DERIVATIVE_SIZES,
  MAX_IMAGES,
  type IcecatClient,
  type IcecatLookupKey,
  type MappedIcecatProduct,
  hasContent,
  icecatAttribution,
  icecatImageKeys,
  icecatImageLicense,
  makeDerivatives,
  mapIcecatProduct,
} from '@pretoscop/icecat';
import type { BlobStore } from '@pretoscop/storage';

export interface IcecatSyncStats {
  candidates: number;
  looked: number;
  found: number;
  notFound: number;
  restricted: number;
  fullOnly: number;
  imagesAdded: number;
  imagesKept: number;
  imagesRemoved: number;
  imageErrors: number;
  confirmed: number;
  capReached: boolean;
  stopped: string | null;
  durationMs: number;
}

export interface IcecatSyncDeps {
  db: Db;
  blob: BlobStore;
  client: IcecatClient;
  log: Logger;
  now?: () => Date;
}

/** GTIN-14 from `product_gtins` → the form printed on the product (EAN-8, UPC-12, EAN-13 or GTIN-14). */
export function printedGtin(gtin14: string): string {
  if (gtin14.startsWith('000000')) return gtin14.slice(6);
  if (gtin14.startsWith('00')) return gtin14.slice(2);
  if (gtin14.startsWith('0')) return gtin14.slice(1);
  return gtin14;
}

function lookupKeys(c: IcecatCandidate): IcecatLookupKey[] {
  const keys: IcecatLookupKey[] = [...new Set(c.gtins.map(printedGtin))].map((gtin) => ({ gtin }));
  if (c.brand && c.mpn) keys.push({ brand: c.brand, mpn: c.mpn });
  return keys;
}

const keyText = (k: IcecatLookupKey) => ('gtin' in k ? k.gtin : `${k.brand} ${k.mpn}`);
/** When several lookups miss, the most specific answer is remembered. */
const MISS_RANK: Record<string, number> = { not_found: 1, restricted: 2, full_only: 3 };

/**
 * `icecat.sync`: for each candidate product (new first, then 30-day refreshes), look the datasheet
 * up by each GTIN, then by brand + MPN, in the first language; when that language has no content,
 * in the next one. A found datasheet is stored in `product_specs` (attribution included), its
 * public gallery copied to the blob store with derivatives (`product_images`, licence note), the
 * first image made primary when the product has none, and a provisional product confirmed when a
 * GTIN found it. Lookups that miss are remembered for 30 days. The run stops at the monthly cap,
 * on a block, a rate limit or a robots.txt refusal (the reason is in the stats). Idempotent.
 */
export async function syncIcecat(
  deps: IcecatSyncDeps,
  opts: { langs: string[]; limit: number; maxImages?: number },
): Promise<IcecatSyncStats> {
  const started = Date.now();
  const now = deps.now ?? (() => new Date());
  const stats: IcecatSyncStats = {
    candidates: 0,
    looked: 0,
    found: 0,
    notFound: 0,
    restricted: 0,
    fullOnly: 0,
    imagesAdded: 0,
    imagesKept: 0,
    imagesRemoved: 0,
    imageErrors: 0,
    confirmed: 0,
    capReached: false,
    stopped: null,
    durationMs: 0,
  };
  const [primary, ...fallbacks] = opts.langs.length > 0 ? opts.langs : ['RO'];
  const candidates = await icecatCandidates(deps.db, { limit: opts.limit });
  stats.candidates = candidates.length;

  outer: for (const c of candidates) {
    stats.looked++;
    let miss: { status: string; detail: string } | null = null;
    const tried: string[] = [];
    for (const key of lookupKeys(c)) {
      tried.push(keyText(key));
      const r = await deps.client.lookup(key, primary!);
      if (r.status === 'cap_reached') {
        stats.capReached = true;
        break outer;
      }
      if (r.status === 'stop') {
        stats.stopped = r.reason;
        break outer;
      }
      if (r.status !== 'found') {
        if (!miss || (MISS_RANK[r.status] ?? 0) > (MISS_RANK[miss.status] ?? 0))
          miss = { status: r.status, detail: r.detail };
        continue;
      }
      const matched = {
        by: 'gtin' in key ? ('gtin' as const) : ('brand_mpn' as const),
        key: keyText(key),
      };
      let mapped: MappedIcecatProduct = mapIcecatProduct(r.response, primary!, matched);
      for (const lang of hasContent(mapped) ? [] : fallbacks) {
        const alt = await deps.client.lookup(key, lang);
        if (alt.status === 'cap_reached' || alt.status === 'stop') break;
        if (alt.status === 'found') {
          const m = mapIcecatProduct(alt.response, lang, matched);
          if (hasContent(m)) {
            mapped = m;
            break;
          }
        }
      }
      const at = now();
      await saveIcecatSpecs(deps.db, {
        productId: c.productId,
        locale: mapped.specs.locale,
        data: mapped.specs as unknown as Record<string, unknown>,
        attribution: icecatAttribution(at.getUTCFullYear()),
        fetchedAt: at,
      });
      stats.found++;
      const stop = await copyImages(
        deps,
        c.productId,
        mapped,
        opts.maxImages ?? MAX_IMAGES,
        stats,
        at,
      );
      if (matched.by === 'gtin' && (await confirmProvisionalByIcecat(deps.db, c.productId)))
        stats.confirmed++;
      deps.log.debug(
        {
          product_id: c.productId,
          by: matched.by,
          key: matched.key,
          features: mapped.specs.features.length,
          images: mapped.images.length,
        },
        'icecat datasheet stored',
      );
      miss = null;
      if (stop) {
        stats.stopped = stop;
        break outer;
      }
      break;
    }
    if (miss) {
      if (miss.status === 'not_found') stats.notFound++;
      else if (miss.status === 'restricted') stats.restricted++;
      else stats.fullOnly++;
      await saveIcecatMiss(deps.db, {
        productId: c.productId,
        status: miss.status,
        detail: miss.detail,
        tried,
        fetchedAt: now(),
      });
    }
  }
  stats.durationMs = Date.now() - started;
  deps.log.info({ ...stats }, 'icecat sync finished');
  return stats;
}

/**
 * Copies the datasheet's public images (derivatives, licence note), keeps the ones already stored
 * (same sha256) and, when every image of the datasheet was read, removes Icecat images the
 * datasheet no longer has (Open Content Licence §4: use the most recent version). Returns a stop
 * reason when the image host refused us.
 */
async function copyImages(
  deps: IcecatSyncDeps,
  productId: number,
  mapped: MappedIcecatProduct,
  max: number,
  stats: IcecatSyncStats,
  at: Date,
): Promise<string | null> {
  const existing = await icecatImagesOf(deps.db, productId);
  const bySha = new Map(existing.map((e) => [e.sha256, e]));
  const keep = new Set<number>();
  let first: number | null = null;
  let complete = true;
  for (const img of mapped.images.slice(0, max)) {
    const r = await deps.client.image(img.url);
    if (r.status === 'stop') return r.reason;
    if (r.status === 'skip') {
      stats.imageErrors++;
      complete = false;
      continue;
    }
    let d: Awaited<ReturnType<typeof makeDerivatives>>;
    try {
      d = await makeDerivatives(r.bytes);
    } catch (err) {
      stats.imageErrors++;
      complete = false;
      deps.log.warn({ err, product_id: productId, url: img.url }, 'icecat image not decodable');
      continue;
    }
    const have = bySha.get(d.sha256);
    if (have) {
      keep.add(have.id);
      first ??= have.id;
      stats.imagesKept++;
      continue;
    }
    const keys = icecatImageKeys(productId, d.sha256);
    await deps.blob.put(keys.base, d.base, 'image/webp');
    for (const size of DERIVATIVE_SIZES)
      await deps.blob.put(keys.sizes[size], d.sizes[size], 'image/webp');
    const id = await insertIcecatImage(deps.db, {
      productId,
      storageKey: keys.base,
      sourceUrl: img.url,
      licenseNote: icecatImageLicense(
        at.getUTCFullYear(),
        mapped.specs.icecatId,
        img.icecatImageId,
      ),
      width: d.width,
      height: d.height,
      sha256: d.sha256,
    });
    bySha.set(d.sha256, { id, sha256: d.sha256, storageKey: keys.base, isPrimary: false });
    keep.add(id);
    first ??= id;
    stats.imagesAdded++;
  }
  if (complete) {
    const stale = existing.filter((e) => !keep.has(e.id));
    for (const s of stale) {
      await deps.blob.delete(s.storageKey);
      for (const size of DERIVATIVE_SIZES)
        await deps.blob.delete(s.storageKey.replace(/\.webp$/, `_${size}.webp`));
    }
    await deleteIcecatImages(
      deps.db,
      productId,
      stale.map((s) => s.id),
    );
    stats.imagesRemoved += stale.length;
  }
  if (first !== null) await setPrimaryImageIfMissing(deps.db, productId, first);
  return null;
}
