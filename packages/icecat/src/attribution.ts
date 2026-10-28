/**
 * Open Icecat licence obligations that travel with the data (Open Content Licence + Fair Use
 * Policy, as summarized in docs/research/notes/gaps_affiliate_and_merchant_channels.md §4):
 * "Specs Icecat" with a link to icecat.biz on every page that shows Icecat content, the database
 * right notice, an AS IS disclaimer, no fee for the content itself, no use for AI training, and
 * Icecat data kept apart from anything exported (B2B, API).
 */

/** `product_specs.source` / `product_images.source` of Icecat content. */
export const ICECAT_SOURCE = 'icecat';
/** `product_specs.source` of a lookup that found nothing (bookkeeping, not Icecat content). */
export const ICECAT_MISS_SOURCE = 'icecat-miss';
export const ICECAT_LINK = 'https://icecat.biz';
/** The credit line the product page shows next to Icecat specs or images (linked to ICECAT_LINK). */
export const ICECAT_CREDIT = 'Specs Icecat';

/** Text stored in `product_specs.attribution` (and shown with the specs). */
export function icecatAttribution(year: number): string {
  return `${ICECAT_CREDIT} (${ICECAT_LINK}). Database Right data-sheet ${year} Icecat. All rights reserved. Datele sunt oferite „ca atare” (AS IS), fără nicio garanție.`;
}

/** Text stored in `product_images.license_note` for an image copied from an Open Icecat datasheet. */
export function icecatImageLicense(
  year: number,
  icecatId: string | null,
  imageId: string | null,
): string {
  const ref = [icecatId ? `Icecat product ${icecatId}` : null, imageId ? `image ${imageId}` : null]
    .filter(Boolean)
    .join(', ');
  return `Open Icecat, Open Content Licence: ${ICECAT_CREDIT} (${ICECAT_LINK}), Database Right data-sheet ${year} Icecat${ref ? ` (${ref})` : ''}. Not for AI training; never exported (B2B/API).`;
}

/**
 * True for rows that hold Icecat content. B2B exports, public APIs and any model-training or
 * text-generation pipeline must drop these rows (CLAUDE.md; Open Content Licence §1, §2b, §10).
 */
export function isIcecatSource(source: string | null | undefined): boolean {
  return source === ICECAT_SOURCE;
}

/**
 * Crawlers Pretoscop's own robots.txt must keep away from pages with Icecat content (Fair Use
 * Policy: "exclude the systematic download by crawlers … for … training of AIs, analytics,
 * content aggregation"). For M16, which owns the site's robots.txt.
 */
export const ICECAT_ROBOTS_DISALLOW_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'Meta-ExternalFetcher',
  'cohere-ai',
  'Diffbot',
  'Timpibot',
  'omgili',
] as const;
