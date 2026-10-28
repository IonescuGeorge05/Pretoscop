import { normalizeMpn } from '@pretoscop/core';
import { emagSlugMpn, emagSlugTail } from './shops/emag';

/**
 * Part-number hints carried by shops' product URLs (`RawOffer.mpnHint`), for re-normalizing stored
 * offers without fetching their pages again. Only eMAG slugs carry one today.
 */
export function urlMpnHint(shopSlug: string, url: string, title: string): string | undefined {
  return shopSlug === 'emag' ? emagSlugMpn(url, title) : undefined;
}

/**
 * True when a stored MPN *field* value is really the URL slug tail: eMAG listing offers recorded
 * before the slug became a hint carried it in `mpn` (`mpn_source = 'field'`). Compared on the
 * structural tail, so implausible tails (ASINs, "CONSOLA620JOCURI") are recognized too.
 */
export function isUrlDerivedMpn(
  shopSlug: string,
  url: string,
  title: string,
  mpn: string | null | undefined,
): boolean {
  if (shopSlug !== 'emag' || !mpn) return false;
  const tail = emagSlugTail(url, title);
  return tail !== undefined && normalizeMpn(tail) === normalizeMpn(mpn);
}
