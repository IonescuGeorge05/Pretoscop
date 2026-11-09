import { isPromotedPlacement } from '@pretoscop/core';
import { billPromotedClick, clicks, eq, isFlagEnabled, programsByShop, sql } from '@pretoscop/db';
import { affiliateLinkFor } from '@/lib/affiliate';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt, isBot } from '@/lib/privacy';
import { logPromoted, refreshPromotedForMerchant } from '@/lib/promoted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLACEMENTS = new Set(['offers_table', 'summary', 'summary_mobile', 'deals', 'category', 'search', 'alert', 'extension', 'promoted_product', 'promoted_category']);

/** A browser prefetch or prerender, not a person's click (never billed). */
function isPrefetch(h: Headers): boolean {
  const purpose = `${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''} ${h.get('x-purpose') ?? ''} ${h.get('x-moz') ?? ''}`.toLowerCase();
  return /prefetch|prerender|preview/.test(purpose);
}

/** A positive integer query parameter, or null. */
function idParam(v: string | null): number | null {
  if (!v || !/^\d{1,15}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

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
 *
 * Promoted clicks (M25, ADR-026): `?p=promoted_product|promoted_category&k={placement}[&c={category}]`.
 * The click is logged like any other (same hashes), then billed to the merchant's wallet when the
 * rules pass (`billPromotedClick`: once per hashed session, offer and day; bots, prefetches, clicks
 * without one of our pages as referer and click bursts are never billed; the auction runs again
 * now). A promoted click never carries an affiliate link, billed or not: the merchant pays for that
 * visit once, by CPC, and no network commission can be matched to it (no sub-id), so CPC and
 * commission revenue never count the same click (`clicks.is_affiliate` stays false).
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
  const url = new URL(req.url);
  const placement = url.searchParams.get('p');
  const promoted = isPromotedPlacement(placement);
  // A promoted click goes to the shop's plain URL (see above); every other click follows M24.
  const enabled = !promoted && (await isFlagEnabled(d, 'affiliate.links.enabled'));
  const shopId = Number(o.shop_id);
  const program = enabled ? (await programsByShop(d, [shopId])).get(shopId) : undefined;
  const offerRef = { url: o.url, shopSlug: o.slug, shopDomain: o.domain, feedAffiliateUrl: o.affiliate_url };
  const isAffiliate = affiliateLinkFor(enabled, program, offerRef, 'c0') !== null;
  const ip = clientIp(req.headers);
  const ua = req.headers.get('user-agent') ?? '';
  const ref = req.headers.get('referer');
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = hashWithDailySalt('ip', ip);
  const sessionHash = hashWithDailySalt(ip, ua);
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
      ipHash,
      sessionHash,
    })
    .returning({ id: clicks.id })
    .catch(() => []);
  const clickId = inserted[0]?.id;
  const placementId = promoted ? idParam(url.searchParams.get('k')) : null;
  if (promoted && placementId !== null) {
    try {
      const outcome = await billPromotedClick(d, {
        placementId,
        offerId: id,
        slot: placement === 'promoted_category' ? 'category' : 'product',
        categoryId: placement === 'promoted_category' ? idParam(url.searchParams.get('c')) : null,
        clickId: clickId ?? null,
        sessionHash,
        ipHash,
        day,
        enabled: await isFlagEnabled(d, 'promoted.enabled'),
        bot: isBot(ua),
        prefetch: isPrefetch(req.headers),
        internalReferer: refererType(ref, url.host) === 'internal',
      });
      // The campaign can no longer pay its bid today: the slot must stop showing it.
      if (outcome.exhausted && outcome.merchantId !== null) await refreshPromotedForMerchant(outcome.merchantId);
    } catch (err) {
      // Billing must never block the visitor: the click-out happens, the click is simply not billed.
      logPromoted('click.billing_failed', { offerId: id, placementId }, err);
    }
  }
  const target = (isAffiliate ? affiliateLinkFor(enabled, program, offerRef, clickId ? `c${clickId}` : undefined) : null) ?? o.url;
  if (isAffiliate && target === o.url && clickId) await d.update(clicks).set({ isAffiliate: false }).where(eq(clicks.id, clickId));
  return new Response(null, { status: 302, headers: { ...headers, location: target } });
}
