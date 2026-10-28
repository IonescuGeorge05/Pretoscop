/**
 * Affiliate links (M24). An affiliate link is used only when the shop's program is approved, the
 * program allows comparators (`comparator_policy` 'allowed' or 'written_ok'), the offer URL is on
 * the shop's own domain (never an open redirect) and the shop is not eMAG (ADR-013: no affiliate
 * relationship). Everything else gets the plain shop URL. Pure: no I/O.
 */

export type AffiliateNetwork = '2performant' | 'profitshare' | 'awin' | 'cj' | 'tradedoubler' | 'other';
export type ComparatorPolicy = 'allowed' | 'forbidden' | 'unknown' | 'written_ok';

export interface AffiliateProgramRef {
  network: string;
  status: string;
  comparatorPolicy: ComparatorPolicy;
  /** Network-side id of the advertiser: 2Performant program unique code, Awin merchant id, CJ ad id, Tradedoubler program id. */
  programExternalId: string | null;
  /** Optional template with `{url}` (encoded), `{raw_url}` and `{sub}` placeholders; wins over the network format. */
  linkTemplate: string | null;
}

export interface AffiliateAccount {
  /** 2Performant affiliate code (aff_code). */
  twoPerformantAffCode?: string | null;
  awinPublisherId?: string | null;
  cjPublisherId?: string | null;
  tradedoublerAffiliateId?: string | null;
}

export interface AffiliateOfferRef {
  url: string;
  shopSlug: string;
  /** The shop's registered domain, e.g. "itgalaxy.ro". */
  shopDomain: string;
}

/** ADR-013: never an affiliate link to eMAG, whatever the registry or a network says. */
const NO_AFFILIATE_SHOPS = new Set(['emag']);

export function affiliateAllowed(program: Pick<AffiliateProgramRef, 'status' | 'comparatorPolicy'> | null, shopSlug: string): boolean {
  return !!program && program.status === 'approved' && (program.comparatorPolicy === 'allowed' || program.comparatorPolicy === 'written_ok') && !NO_AFFILIATE_SHOPS.has(shopSlug);
}

function onShopDomain(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const d = domain.toLowerCase().replace(/^www\./, '');
    return (u.protocol === 'https:' || u.protocol === 'http:') && (host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Sub-ids carry our click id so commissions can be attributed to clicks; letters and digits only. */
function cleanSub(sub: string | undefined): string {
  return (sub ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

/**
 * Documented deep-link formats (verify each against a link generated in the network's dashboard
 * when the account exists):
 *  - 2Performant quicklink: https://event.2performant.com/events/click?ad_type=quicklink&aff_code=…&unique=…&redirect_to=…&st=…
 *  - Awin: https://www.awin1.com/cread.php?awinmid=…&awinaffid=…&ued=…&clickref=…
 *  - CJ: https://www.anrdoezrs.net/click-{PID}-{AID}?url=…&sid=…
 *  - Tradedoubler: https://clk.tradedoubler.com/click?p=…&a=…&url=…&epi=…
 * Profitshare links are created through its API (stored on the offer), so there is no offline format.
 */
export function buildAffiliateUrl(offer: AffiliateOfferRef, program: AffiliateProgramRef | null, account: AffiliateAccount, opts: { sub?: string } = {}): string | null {
  if (!program || !affiliateAllowed(program, offer.shopSlug) || !onShopDomain(offer.url, offer.shopDomain)) return null;
  const url = encodeURIComponent(offer.url);
  const sub = cleanSub(opts.sub);
  if (program.linkTemplate) {
    if (!program.linkTemplate.startsWith('https://')) return null;
    return program.linkTemplate.replaceAll('{url}', url).replaceAll('{raw_url}', offer.url).replaceAll('{sub}', sub);
  }
  const id = program.programExternalId;
  switch (program.network) {
    case '2performant':
      if (!id || !account.twoPerformantAffCode) return null;
      return `https://event.2performant.com/events/click?ad_type=quicklink&aff_code=${encodeURIComponent(account.twoPerformantAffCode)}&unique=${encodeURIComponent(id)}&redirect_to=${url}${sub ? `&st=${sub}` : ''}`;
    case 'awin':
      if (!id || !account.awinPublisherId) return null;
      return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(id)}&awinaffid=${encodeURIComponent(account.awinPublisherId)}&ued=${url}${sub ? `&clickref=${sub}` : ''}`;
    case 'cj':
      if (!id || !account.cjPublisherId) return null;
      return `https://www.anrdoezrs.net/click-${encodeURIComponent(account.cjPublisherId)}-${encodeURIComponent(id)}?url=${url}${sub ? `&sid=${sub}` : ''}`;
    case 'tradedoubler':
      if (!id || !account.tradedoublerAffiliateId) return null;
      return `https://clk.tradedoubler.com/click?p=${encodeURIComponent(id)}&a=${encodeURIComponent(account.tradedoublerAffiliateId)}&url=${url}${sub ? `&epi=${sub}` : ''}`;
    default:
      return null;
  }
}

/**
 * 2Performant traffic-source permission → our comparator policy. Advertisers mark "Price
 * Comparison Services" YES / MAYBE / NO; an allowed type can only be closed with 180 days' notice,
 * shown as an `end_at` date. "Product Aggregators" counts too when price comparison is not stated.
 */
export function comparatorPolicyFrom2P(sources: Array<{ name: string; usage: string; status?: string | null; end_at?: string | null }>, today: string): { policy: ComparatorPolicy; endsOn: string | null } {
  const live = sources.filter((s) => s.status !== 'deleted');
  const pick = live.find((s) => /price comparison/i.test(s.name)) ?? live.find((s) => /product aggregator/i.test(s.name));
  if (!pick) return { policy: 'unknown', endsOn: null };
  const usage = pick.usage.toLowerCase();
  const endsOn = pick.end_at ? pick.end_at.slice(0, 10) : null;
  if (usage === 'yes') return { policy: endsOn && endsOn <= today ? 'forbidden' : 'allowed', endsOn };
  if (usage === 'no') return { policy: 'forbidden', endsOn };
  return { policy: 'unknown', endsOn };
}
