import { bucharestToday, extDailyLows, resolveExtLookup, shopUrlParts, sql, type Db } from '@pretoscop/db';
import { unstable_cache } from 'next/cache';
import { db, serverEnv } from '@/lib/db';
import { buildLookupResponse, CORS_HEADERS, createLookupLimiter, EXT_LOOKUP_FLAG, historyFrom, parseLookupQuery } from '@/lib/ext-lookup';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { getProductPageData } from '@/lib/product';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * In memory, per web process (two replicas in production double the effective limit; documented in
 * apps/web/README.md "Browser extension API"). Keyed by a daily-salted hash of the client IP, never
 * the raw IP or the User-Agent; nothing is stored.
 */
const limiter = createLookupLimiter();

/** The default chart series of the last 180 days, cached per product and invalidated with the product page (tags `product:{id}`, `products`). */
const dailyLowsOf = (id: number, today: string) =>
  unstable_cache(() => extDailyLows(db(), id, historyFrom(today), today), ['ext-daily-lows', String(id), today], {
    tags: [`product:${id}`, 'products'],
    revalidate: 3600,
  })();

function reply(status: number, body: unknown, cache: 'public' | 'none', extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      'cache-control': cache === 'public' ? 'public, max-age=300' : 'no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  });
}

/** Kill switch: the flag, and single shops switched off in its config (`disabled_shops`, shop slugs). */
async function lookupAllowed(d: Db, url: string | null): Promise<boolean> {
  const r = await d.execute<{ enabled: boolean; config: { disabled_shops?: unknown } | null }>(
    sql`SELECT enabled, config FROM feature_flags WHERE key = ${EXT_LOOKUP_FLAG}`,
  );
  const flag = r.rows[0];
  if (!flag?.enabled) return false;
  const off = Array.isArray(flag.config?.disabled_shops) ? flag.config.disabled_shops.filter((s): s is string => typeof s === 'string') : [];
  if (off.length === 0 || !url) return true;
  const domain = shopUrlParts(url)?.domain;
  if (!domain) return true;
  const shop = await d.execute<{ slug: string }>(sql`SELECT slug FROM shops WHERE domain = ${domain}`);
  return !shop.rows.some((s) => off.includes(s.slug));
}

/** CORS preflight (the extension sends simple GETs; answered for any other client). */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'cache-control': 'public, max-age=86400' } });
}

/**
 * GET /api/ext/lookup?url=&gtin=&brand=&mpn= (M26 contract, apps/web/README.md "Browser extension
 * API"): 200 with the product's prices and history, 404 when nothing resolves (or only ambiguously),
 * 400 on malformed input, 429 over the rate limit (Retry-After), 503 while switched off or failing.
 */
export async function GET(req: Request): Promise<Response> {
  const limit = limiter.hit(hashWithDailySalt('ext-lookup', clientIp(req.headers)));
  if (!limit.allowed) return reply(429, { error: 'rate_limited' }, 'none', { 'retry-after': String(limit.retryAfterSec) });
  const parsed = parseLookupQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return reply(400, { error: parsed.error }, 'none');
  try {
    const d = db();
    if (!(await lookupAllowed(d, parsed.query.url))) return reply(503, { error: 'disabled' }, 'none');
    const found = await resolveExtLookup(d, parsed.query);
    if (!found) return reply(404, { error: 'not_found' }, 'public');
    const page = await getProductPageData(found.productId);
    if (!page || page.status !== 'active') return reply(404, { error: 'not_found' }, 'public');
    const today = bucharestToday();
    const lows = await dailyLowsOf(found.productId, today);
    return reply(200, buildLookupResponse(page, lows, found.matchedBy, serverEnv().PUBLIC_BASE_URL, today), 'public');
  } catch (err) {
    // Identifiers of public product pages only; nothing about the requester is logged.
    console.error(JSON.stringify({ msg: 'ext lookup failed', error: err instanceof Error ? err.message : String(err) }));
    return reply(503, { error: 'unavailable' }, 'none');
  }
}
