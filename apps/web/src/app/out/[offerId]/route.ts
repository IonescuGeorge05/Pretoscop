import { clicks, eq, isFlagEnabled, programsByShop, sql } from '@pretoscop/db';
import { affiliateLinkFor } from '@/lib/affiliate';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLACEMENTS = new Set(['offers_table', 'summary', 'summary_mobile', 'deals', 'category', 'search', 'alert', 'extension']);

function refererType(ref: string | null, host: string): 'none' | 'internal' | 'external' {
  if (!ref) return 'none';
  try {
    return new URL(ref).host === host ? 'internal' : 'external';
  } catch {
    return 'external';
  }
}

/**
 * Click-out (M13, M24): validates the offer, logs a click with daily-salted hashes (no raw IP/UA),
 * then 302s to an affiliate link only when affiliate links are enabled and the shop's program is
 * approved and allows comparators (never for eMAG, ADR-013); otherwise to the shop's own URL. The
 * link carries our click id as the network sub-id (`c{id}`), so imported commissions match clicks.
 * The decision is made at click time: a program the nightly sync marks forbidden gets plain links
 * immediately. Never indexed.
 */
export async function GET(req: Request, ctx: { params: Promise<{ offerId: string }> }): Promise<Response> {
  const { offerId } = await ctx.params;
  const id = Number(offerId);
  const headers = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer-when-downgrade' };
  if (!Number.isInteger(id) || id <= 0) return new Response('Ofertă inexistentă', { status: 404, headers });
  const d = db();
  const r = await d.execute<{ url: string; affiliate_url: string | null; product_id: string | null; shop_id: string; slug: string; domain: string }>(sql`
    SELECT o.url, o.affiliate_url, o.product_id::text, o.shop_id::text, s.slug, s.domain
    FROM offers o JOIN shops s ON s.id = o.shop_id
    WHERE o.id = ${id}
    LIMIT 1
  `);
  const o = r.rows[0];
  if (!o || !/^https?:\/\//.test(o.url)) return new Response('Ofertă inexistentă', { status: 404, headers });
  const enabled = await isFlagEnabled(d, 'affiliate.links.enabled');
  const shopId = Number(o.shop_id);
  const program = enabled ? (await programsByShop(d, [shopId])).get(shopId) : undefined;
  const offerRef = { url: o.url, shopSlug: o.slug, shopDomain: o.domain, feedAffiliateUrl: o.affiliate_url };
  const isAffiliate = affiliateLinkFor(enabled, program, offerRef, 'c0') !== null;
  const url = new URL(req.url);
  const placement = url.searchParams.get('p');
  const ip = clientIp(req.headers);
  const ua = req.headers.get('user-agent') ?? '';
  const ref = req.headers.get('referer');
  const inserted = await d
    .insert(clicks)
    .values({
      offerId: id,
      productId: o.product_id ? Number(o.product_id) : null,
      shopId,
      isAffiliate,
      placement: placement && PLACEMENTS.has(placement) ? placement : null,
      refererType: refererType(ref, url.host),
      uaHash: hashWithDailySalt('ua', ua),
      ipHash: hashWithDailySalt('ip', ip),
      sessionHash: hashWithDailySalt(ip, ua),
    })
    .returning({ id: clicks.id })
    .catch(() => []);
  const clickId = inserted[0]?.id;
  const target = (isAffiliate ? affiliateLinkFor(enabled, program, offerRef, clickId ? `c${clickId}` : undefined) : null) ?? o.url;
  if (isAffiliate && target === o.url && clickId) await d.update(clicks).set({ isAffiliate: false }).where(eq(clicks.id, clickId));
  return new Response(null, { status: 302, headers: { ...headers, location: target } });
}
