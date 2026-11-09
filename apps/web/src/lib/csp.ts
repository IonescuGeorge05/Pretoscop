/**
 * Content Security Policy (M16; docs/03 §10), built at build time by next.config.ts from the
 * NEXT_PUBLIC_* values the pages inline. Pure: no `server-only`, so next.config.ts and the unit
 * tests import it.
 *
 * - Plausible's origin is allowed only when it is configured (it loads only after consent, M17).
 * - Google's ad origins (M25 optional ad slot) are allowed only in a build made with
 *   NEXT_PUBLIC_ADSENSE_CLIENT, the slot's build-time switch. A build without it keeps the strict
 *   policy: even if someone turned the flag `ads.slots.enabled` on, the browser would refuse every
 *   ad script and frame. The runtime flag and the visitor's consent decide the rest.
 * - Next.js streams its RSC payload in inline scripts, so script-src keeps 'unsafe-inline' unless
 *   every page became dynamic for nonces.
 */

export interface CspInput {
  dev: boolean;
  plausibleScriptUrl?: string | null;
  mediaBaseUrl?: string | null;
  adsenseClient?: string | null;
}

const originOf = (url: string | null | undefined): string | null => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/**
 * What AdSense (adsbygoogle.js, its ad frames and Google's ad-traffic-quality checks) needs, from
 * Google's CSP guidance for AdSense. Check it again against Google's current list before switching
 * ads on (docs/13 open items): a missing host only blanks the ad, it never weakens anything else.
 */
export const ADSENSE_CSP = {
  script: ['https://pagead2.googlesyndication.com', 'https://tpc.googlesyndication.com', 'https://*.adtrafficquality.google', 'https://fundingchoicesmessages.google.com'],
  frame: ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://*.googlesyndication.com', 'https://www.google.com', 'https://*.adtrafficquality.google', 'https://fundingchoicesmessages.google.com'],
  img: ['https://*.googlesyndication.com', 'https://*.g.doubleclick.net', 'https://*.google.com', 'https://*.gstatic.com', 'https://*.adtrafficquality.google'],
  connect: ['https://pagead2.googlesyndication.com', 'https://*.g.doubleclick.net', 'https://*.google.com', 'https://*.adtrafficquality.google', 'https://fundingchoicesmessages.google.com'],
} as const;

/** Whether this build may show the optional ad slot at all (its CSP lets the ad origins in). */
export function adsBuildEnabled(adsenseClient: string | null | undefined): boolean {
  return typeof adsenseClient === 'string' && /^ca-pub-\d{10,20}$/.test(adsenseClient);
}

export function contentSecurityPolicy(input: CspInput): string {
  const plausible = originOf(input.plausibleScriptUrl);
  const media = originOf(input.mediaBaseUrl);
  const ads = adsBuildEnabled(input.adsenseClient);
  const extra = (...v: Array<string | null | false | readonly string[]>) =>
    v
      .flat()
      .filter(Boolean)
      .map((s) => ` ${s}`)
      .join('');
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${extra(input.dev && "'unsafe-eval'", plausible, ads && ADSENSE_CSP.script)}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra(media, ads && ADSENSE_CSP.img)}`,
    "font-src 'self'",
    `connect-src 'self'${extra(plausible, input.dev && 'ws:', ads && ADSENSE_CSP.connect)}`,
    // Without the ad slot no page embeds a frame; default-src already says 'self'.
    ...(ads ? [`frame-src 'self'${extra(ADSENSE_CSP.frame)}`] : []),
    "frame-ancestors 'self'",
    "base-uri 'self'",
    // Stripe Checkout (M25 top-ups): without JavaScript the top-up form's answer is a redirect to
    // the hosted payment page, and browsers apply form-action to that redirect.
    "form-action 'self' https://checkout.stripe.com",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join('; ');
}
