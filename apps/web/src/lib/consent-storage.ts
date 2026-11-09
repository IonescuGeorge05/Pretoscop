/**
 * Where the analytics consent choice lives on the visitor's device (localStorage, never a cookie).
 * Plain module so server components (the /cookies page) can name the key; the banner logic is in
 * `components/consent/consent.tsx`.
 */
export const CONSENT_KEY = 'pretoscop.consent';
/** The separate choice about the optional ad slot (M25), same storage and rules. */
export const ADS_CONSENT_KEY = 'pretoscop.consent.ads';
