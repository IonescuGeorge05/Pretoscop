// Filled in by build.ts (esbuild `define`): where the extension asks for lookups and where the
// panel's link points. Production builds use https://pretoscop.ro for both.
declare const __PRETOSCOP_API_BASE__: string;
declare const __PRETOSCOP_SITE_BASE__: string;

export const API_BASE: string = __PRETOSCOP_API_BASE__;
export const SITE_BASE: string = __PRETOSCOP_SITE_BASE__;
