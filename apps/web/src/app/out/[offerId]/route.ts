import { clicks, isFlagEnabled, sql } from '@pretoscop/db';
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
 * Click-out (M13): validates the offer, logs a click with daily-salted hashes (no raw IP/UA), then
 * 302s to the affiliate link only when affiliate links are enabled and the program allows
 * comparators; otherwise to the shop's own URL. Never indexed.
 */
export async function GET(req: Request, ctx: { params: Promise<{ offerId: string }> }): Promise<Response> {
  const { offerId } = await ctx.params;
  const id = Number(offerId);
  const headers = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer-when-downgrade' };
  if (!Number.isInteger(id) || id <= 0) return new Response('Ofertă inexistentă', { status: 404, headers });
  const d = db();
  const r = await d.execute<{ url: string; affiliate_url: string | null; product_id: string | null; shop_id: string; policy: string | null }>(sql`
    SELECT o.url, o.affiliate_url, o.product_id::text, o.shop_id::text, ap.comparator_policy AS policy
    FROM offers o LEFT JOIN affiliate_programs ap ON ap.shop_id = o.shop_id AND ap.status = 'approved'
    WHERE o.id = ${id}
    LIMIT 1
  `);
  const o = r.rows[0];
  if (!o || !/^https?:\/\//.test(o.url)) return new Response('Ofertă inexistentă', { status: 404, headers });
  const affiliateAllowed = !!o.affiliate_url && (o.policy === 'allowed' || o.policy === 'written_ok') && (await isFlagEnabled(d, 'affiliate.links.enabled'));
  const target = affiliateAllowed ? o.affiliate_url! : o.url;
  const url = new URL(req.url);
  const placement = url.searchParams.get('p');
  const ip = clientIp(req.headers);
  const ua = req.headers.get('user-agent') ?? '';
  const ref = req.headers.get('referer');
  await d
    .insert(clicks)
    .values({
      offerId: id,
      productId: o.product_id ? Number(o.product_id) : null,
      shopId: Number(o.shop_id),
      isAffiliate: affiliateAllowed,
      placement: placement && PLACEMENTS.has(placement) ? placement : null,
      refererType: refererType(ref, url.host),
      uaHash: hashWithDailySalt('ua', ua),
      ipHash: hashWithDailySalt('ip', ip),
      sessionHash: hashWithDailySalt(ip, ua),
    })
    .catch(() => undefined);
  return new Response(null, { status: 302, headers: { ...headers, location: target } });
}
