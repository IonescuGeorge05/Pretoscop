import { sql } from 'drizzle-orm';
import type { Db } from '../client';

export interface CrawlUrlInput {
  url: string;
  externalHint?: string | null;
  priority?: number;
  tier?: string | null;
}

/** Inserts or refreshes discovered URLs (one statement per 1,000). Priority only ever rises with new evidence. */
export async function upsertCrawlUrls(
  db: Db,
  shopId: number,
  sourceId: number | null,
  rows: CrawlUrlInput[],
  kind: 'product' | 'listing' = 'product',
): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000);
    const urls = batch.map((r) => r.url);
    const hints = batch.map((r) => r.externalHint ?? null);
    const prios = batch.map((r) => r.priority ?? 0);
    const tiers = batch.map((r) => r.tier ?? null);
    const res = await db.execute(sql`
      INSERT INTO crawl_urls (shop_id, source_id, url, kind, external_hint, priority, tier, first_seen_at, last_seen_at)
      SELECT ${shopId}, ${sourceId}, u.url, ${kind}, u.hint, u.prio, u.tier, now(), now()
      FROM unnest(${sql.param(urls)}::text[], ${sql.param(hints)}::text[], ${sql.param(prios)}::real[], ${sql.param(tiers)}::text[])
        AS u(url, hint, prio, tier)
      ON CONFLICT (shop_id, url) DO UPDATE SET
        last_seen_at = now(),
        source_id = COALESCE(crawl_urls.source_id, EXCLUDED.source_id),
        external_hint = COALESCE(EXCLUDED.external_hint, crawl_urls.external_hint),
        priority = CASE WHEN EXCLUDED.priority > 0 THEN EXCLUDED.priority ELSE crawl_urls.priority END,
        tier = COALESCE(EXCLUDED.tier, crawl_urls.tier),
        gone_at = NULL
    `);
    n += res.rowCount ?? 0;
  }
  return n;
}

export type UrlOrder = 'oldest' | 'priority';

/** Next URLs a product-page source should fetch for a shop. */
export async function pickCrawlUrls(
  db: Db,
  shopId: number,
  limit: number,
  order: UrlOrder,
  opts: { sourceId?: number; notFetchedWithinHours?: number } = {},
): Promise<{ id: number; url: string }[]> {
  const orderBy =
    order === 'priority'
      ? sql`priority DESC, last_fetched_at ASC NULLS FIRST`
      : sql`last_fetched_at ASC NULLS FIRST, priority DESC`;
  const recent = opts.notFetchedWithinHours
    ? sql`AND (last_fetched_at IS NULL OR last_fetched_at < now() - make_interval(hours => ${opts.notFetchedWithinHours}::int))`
    : sql``;
  const bySource = opts.sourceId ? sql`AND (source_id = ${opts.sourceId} OR source_id IS NULL)` : sql``;
  const res = await db.execute<{ id: string; url: string }>(sql`
    SELECT id::text, url FROM crawl_urls
    WHERE shop_id = ${shopId} AND kind = 'product' AND gone_at IS NULL ${recent} ${bySource}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `);
  return res.rows.map((r) => ({ id: Number(r.id), url: r.url }));
}

export async function markCrawlUrlFetched(db: Db, id: number, status: number, ok: boolean): Promise<void> {
  const gone = status === 404 || status === 410;
  await db.execute(sql`
    UPDATE crawl_urls SET
      last_fetched_at = now(),
      last_status = ${status},
      fail_count = CASE WHEN ${ok} THEN 0 ELSE fail_count + 1 END,
      gone_at = CASE WHEN ${gone} THEN now() ELSE gone_at END
    WHERE id = ${id}
  `);
}

/** A product page answered 404/410: its offers are gone (delisting evidence). */
export async function deactivateOffersByUrl(db: Db, shopId: number, url: string): Promise<number> {
  const res = await db.execute(sql`
    UPDATE offers SET active = false, updated_at = now() WHERE shop_id = ${shopId} AND url = ${url} AND active
  `);
  return res.rowCount ?? 0;
}

/** Most recent discovery time of a source (max last_seen_at of the URLs it found). */
export async function lastDiscoveryAt(db: Db, sourceId: number): Promise<Date | null> {
  const res = await db.execute<{ ms: string | null }>(
    sql`SELECT (extract(epoch FROM max(last_seen_at)) * 1000)::bigint::text AS ms FROM crawl_urls WHERE source_id = ${sourceId}`,
  );
  const ms = res.rows[0]?.ms;
  return ms ? new Date(Number(ms)) : null;
}

/** Median `parsed` of the source's successful runs in the last 7 days (feed/listing size guard). */
export async function medianParsedLast7Days(db: Db, sourceId: number): Promise<number | null> {
  const res = await db.execute<{ m: string | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (stats->>'parsed')::numeric)::text AS m
    FROM ingest_runs
    WHERE source_id = ${sourceId} AND status = 'success' AND started_at > now() - interval '7 days'
  `);
  const m = res.rows[0]?.m;
  return m === null || m === undefined ? null : Number(m);
}
