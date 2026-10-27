/**
 * Where the analytics consent choice lives on the visitor's device (localStorage, never a cookie).
 * Plain module so server components (the /cookies page) can name the key; the banner logic is in
 * `components/consent/consent.tsx`.
 */
export const CONSENT_KEY = 'pretoscop.consent';
