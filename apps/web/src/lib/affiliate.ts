import 'server-only';
import { affiliateAllowed, buildAffiliateUrl, type AffiliateAccount, type AffiliateOfferRef } from '@pretoscop/core';
import type { ProgramRow } from '@pretoscop/db';
import { serverEnv } from './db';

/** Our publisher ids per network (env); a network without one gets plain links. */
export function affiliateAccount(): AffiliateAccount {
  const env = serverEnv();
  return {
    twoPerformantAffCode: env.TWOPERFORMANT_UNIQUE_CODE ?? null,
    awinPublisherId: env.AWIN_PUBLISHER_ID ?? null,
    cjPublisherId: env.CJ_PUBLISHER_ID ?? null,
    tradedoublerAffiliateId: env.TRADEDOUBLER_AFFILIATE_ID ?? null,
  };
}

/**
 * Whether a click-out for this offer would use an affiliate link (M24): flag on, program approved and
 * allowing comparators, not eMAG (ADR-013), and either a link we can build or one from the shop's
 * affiliate feed. The product page labels exactly these offers "Link afiliat".
 */
export function affiliateLinkFor(enabled: boolean, program: ProgramRow | null | undefined, offer: AffiliateOfferRef & { feedAffiliateUrl: string | null }, sub?: string): string | null {
  if (!enabled || !program || !affiliateAllowed(program, offer.shopSlug)) return null;
  const built = buildAffiliateUrl(offer, program, affiliateAccount(), { sub });
  if (built) return built;
  return offer.feedAffiliateUrl && /^https:\/\//.test(offer.feedAffiliateUrl) ? offer.feedAffiliateUrl : null;
}
