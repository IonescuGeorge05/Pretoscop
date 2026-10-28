import { sql } from 'drizzle-orm';
import type { Db } from '../client';

/**
 * Open Icecat enrichment (M11). Icecat content lives only in `product_specs` (`source = 'icecat'`)
 * and `product_images` (`source = 'icecat'`): it never enters `products`, `product_gtins` or any
 * export (CLAUDE.md; Open Content Licence). A lookup that found nothing is remembered as a
 * `product_specs` row with `source = 'icecat-miss'` so it is retried monthly, not daily.
 */

export interface IcecatCandidate {
  productId: number;
  brand: string | null;
  mpn: string | null;
  gtins: string[];
  /** Date of the stored Icecat datasheet (refresh), or null (never found). */
  specsFetchedAt: Date | null;
}

/**
 * Products to look up now: active, with a GTIN or brand + MPN, never looked up, or whose datasheet
 * or miss is older than `refreshDays`. New products first, then the most offered/popular.
 */
export async function icecatCandidates(
  db: Db,
  opts: { limit: number; refreshDays?: number },
): Promise<IcecatCandidate[]> {
  const days = opts.refreshDays ?? 30;
  const res = await db.execute<{
    id: string;
    brand: string | null;
    mpn: string | null;
    gtins: string[] | null;
    specs_at: string | null;
  }>(sql`
    SELECT p.id::text, b.name AS brand, p.mpn,
      (SELECT array_agg(g.gtin14 ORDER BY g.confidence DESC, g.gtin14) FROM product_gtins g WHERE g.product_id = p.id) AS gtins,
      (SELECT max(s.fetched_at)::text FROM product_specs s WHERE s.product_id = p.id AND s.source = 'icecat') AS specs_at
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.status = 'active'
      AND (EXISTS (SELECT 1 FROM product_gtins g WHERE g.product_id = p.id) OR (b.name IS NOT NULL AND p.mpn IS NOT NULL))
      AND NOT EXISTS (
        SELECT 1 FROM product_specs s
        WHERE s.product_id = p.id AND s.source IN ('icecat', 'icecat-miss')
          AND s.fetched_at > now() - make_interval(days => ${days}::int)
      )
    ORDER BY EXISTS (SELECT 1 FROM product_specs s WHERE s.product_id = p.id AND s.source = 'icecat'), p.offer_count DESC, p.popularity DESC, p.id
    LIMIT ${opts.limit}
  `);
  return res.rows.map((r) => ({
    productId: Number(r.id),
    brand: r.brand,
    mpn: r.mpn,
    gtins: r.gtins ?? [],
    specsFetchedAt: r.specs_at ? new Date(r.specs_at) : null,
  }));
}

/** Stores (or refreshes) a product's Icecat datasheet in one language and forgets earlier misses. */
export async function saveIcecatSpecs(
  db: Db,
  row: {
    productId: number;
    locale: string;
    data: Record<string, unknown>;
    attribution: string;
    fetchedAt?: Date;
  },
): Promise<void> {
  const at = row.fetchedAt ?? new Date();
  await db.execute(sql`
    INSERT INTO product_specs (product_id, source, locale, data, attribution, fetched_at)
    VALUES (${row.productId}, 'icecat', ${row.locale}, ${JSON.stringify(row.data)}::jsonb, ${row.attribution}, ${at.toISOString()}::timestamptz)
    ON CONFLICT (product_id, source, locale) DO UPDATE SET data = EXCLUDED.data, attribution = EXCLUDED.attribution, fetched_at = EXCLUDED.fetched_at
  `);
  await db.execute(
    sql`DELETE FROM product_specs WHERE product_id = ${row.productId} AND source = 'icecat-miss'`,
  );
}

/** Remembers that no lookup found the product (status: not_found | restricted | full_only). */
export async function saveIcecatMiss(
  db: Db,
  row: { productId: number; status: string; detail: string; tried: string[]; fetchedAt?: Date },
): Promise<void> {
  const at = row.fetchedAt ?? new Date();
  const data = { status: row.status, detail: row.detail.slice(0, 300), tried: row.tried };
  await db.execute(sql`
    INSERT INTO product_specs (product_id, source, locale, data, attribution, fetched_at)
    VALUES (${row.productId}, 'icecat-miss', 'ro', ${JSON.stringify(data)}::jsonb, NULL, ${at.toISOString()}::timestamptz)
    ON CONFLICT (product_id, source, locale) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
  `);
}

export interface StoredImage {
  id: number;
  sha256: string | null;
  storageKey: string;
  isPrimary: boolean;
}

export async function icecatImagesOf(db: Db, productId: number): Promise<StoredImage[]> {
  const res = await db.execute<{
    id: string;
    sha256: string | null;
    storage_key: string;
    is_primary: boolean;
  }>(sql`
    SELECT id::text, sha256, storage_key, is_primary FROM product_images WHERE product_id = ${productId} AND source = 'icecat' ORDER BY id
  `);
  return res.rows.map((r) => ({
    id: Number(r.id),
    sha256: r.sha256,
    storageKey: r.storage_key,
    isPrimary: r.is_primary,
  }));
}

export async function insertIcecatImage(
  db: Db,
  row: {
    productId: number;
    storageKey: string;
    sourceUrl: string;
    licenseNote: string;
    width: number;
    height: number;
    sha256: string;
  },
): Promise<number> {
  const res = await db.execute<{ id: string }>(sql`
    INSERT INTO product_images (product_id, storage_key, source, source_url, license_note, width, height, sha256, is_primary)
    VALUES (${row.productId}, ${row.storageKey}, 'icecat', ${row.sourceUrl}, ${row.licenseNote}, ${row.width}, ${row.height}, ${row.sha256}, false)
    RETURNING id::text
  `);
  return Number(res.rows[0]!.id);
}

/** Removes Icecat image rows (their blobs are deleted by the caller); clears a primary pointer to them. */
export async function deleteIcecatImages(db: Db, productId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(sql`
    UPDATE products SET primary_image_id = NULL WHERE id = ${productId} AND primary_image_id = ANY(${sql.param(ids)}::bigint[])
  `);
  await db.execute(
    sql`DELETE FROM product_images WHERE product_id = ${productId} AND source = 'icecat' AND id = ANY(${sql.param(ids)}::bigint[])`,
  );
}

/**
 * Makes `imageId` the product's primary image when the product has none from any licensed source
 * (a feed or manual image chosen earlier stays primary). Returns true when it did.
 */
export async function setPrimaryImageIfMissing(
  db: Db,
  productId: number,
  imageId: number,
): Promise<boolean> {
  const has = await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n FROM product_images WHERE product_id = ${productId} AND is_primary
  `);
  if (Number(has.rows[0]?.n ?? 0) > 0) return false;
  await db.execute(
    sql`UPDATE product_images SET is_primary = true WHERE id = ${imageId} AND product_id = ${productId}`,
  );
  await db.execute(
    sql`UPDATE products SET primary_image_id = ${imageId}, updated_at = now() WHERE id = ${productId}`,
  );
  return true;
}

/**
 * A provisional product (created by the matcher from one offer) is confirmed by an Icecat
 * datasheet found through one of its GTINs (docs/03 §6.3: Icecat specs end the noindex period).
 */
export async function confirmProvisionalByIcecat(db: Db, productId: number): Promise<boolean> {
  const res = await db.execute(
    sql`UPDATE products SET provisional = false, updated_at = now() WHERE id = ${productId} AND provisional`,
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Counts one datasheet request of `lang` in the current UTC month unless `cap` is reached.
 * Interim storage until a dedicated table exists: `fetch_domain_daily` rows keyed `icecat:<LANG>`
 * (one row per day; the month total is their sum). See packages/icecat/README.md.
 */
export async function reserveIcecatUsage(
  db: Db,
  lang: string,
  cap: number,
  now: Date,
): Promise<{ allowed: boolean; used: number }> {
  const key = `icecat:${lang.toUpperCase()}`;
  const day = now.toISOString().slice(0, 10);
  const month = `${day.slice(0, 7)}-01`;
  const res = await db.execute<{ requests: number }>(sql`
    WITH used AS (
      SELECT coalesce(sum(requests), 0)::int AS n FROM fetch_domain_daily
      WHERE host = ${key} AND day >= ${month}::date AND day <= ${day}::date
    )
    INSERT INTO fetch_domain_daily AS d (host, day, requests)
    SELECT ${key}, ${day}::date, 1 FROM used WHERE used.n < ${cap}::int
    ON CONFLICT (host, day) DO UPDATE SET requests = d.requests + 1
    RETURNING requests
  `);
  const used = await icecatUsage(db, lang, now);
  return { allowed: res.rows.length > 0, used };
}

export async function icecatUsage(db: Db, lang: string, now: Date): Promise<number> {
  const key = `icecat:${lang.toUpperCase()}`;
  const day = now.toISOString().slice(0, 10);
  const res = await db.execute<{ n: string }>(sql`
    SELECT coalesce(sum(requests), 0)::text AS n FROM fetch_domain_daily
    WHERE host = ${key} AND day >= ${`${day.slice(0, 7)}-01`}::date AND day <= ${day}::date
  `);
  return Number(res.rows[0]?.n ?? 0);
}

export interface IcecatCoverageRow {
  brand: string;
  products: number;
  withSpecs: number;
  notFound: number;
  restricted: number;
  fullOnly: number;
  notTried: number;
}

/** Per brand: products that can be looked up (GTIN or MPN) and what Icecat answered. */
export async function icecatCoverage(db: Db): Promise<IcecatCoverageRow[]> {
  const res = await db.execute<{
    brand: string;
    products: string;
    with_specs: string;
    not_found: string;
    restricted: string;
    full_only: string;
    not_tried: string;
  }>(sql`
    WITH p AS (
      SELECT p.id, coalesce(b.name, '(fără brand)') AS brand,
        EXISTS (SELECT 1 FROM product_specs s WHERE s.product_id = p.id AND s.source = 'icecat') AS found,
        (SELECT s.data->>'status' FROM product_specs s WHERE s.product_id = p.id AND s.source = 'icecat-miss' LIMIT 1) AS miss
      FROM products p LEFT JOIN brands b ON b.id = p.brand_id
      WHERE p.status = 'active'
        AND (EXISTS (SELECT 1 FROM product_gtins g WHERE g.product_id = p.id) OR (b.name IS NOT NULL AND p.mpn IS NOT NULL))
    )
    SELECT brand, count(*)::text AS products, count(*) FILTER (WHERE found)::text AS with_specs,
      count(*) FILTER (WHERE NOT found AND miss = 'not_found')::text AS not_found,
      count(*) FILTER (WHERE NOT found AND miss = 'restricted')::text AS restricted,
      count(*) FILTER (WHERE NOT found AND miss = 'full_only')::text AS full_only,
      count(*) FILTER (WHERE NOT found AND miss IS NULL)::text AS not_tried
    FROM p GROUP BY brand ORDER BY count(*) DESC, brand
  `);
  return res.rows.map((r) => ({
    brand: r.brand,
    products: Number(r.products),
    withSpecs: Number(r.with_specs),
    notFound: Number(r.not_found),
    restricted: Number(r.restricted),
    fullOnly: Number(r.full_only),
    notTried: Number(r.not_tried),
  }));
}
