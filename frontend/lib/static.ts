// Mod static (GitHub Pages): fără server, datele vin din fișiere JSON publicate lângă pagini.
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL public al unui fișier din snapshot, ex. dataUrl("history/ps5-pro-2tb/90d-day.json") */
export const dataUrl = (rel: string) => `${BASE_PATH}/data/${rel}`;

/** Adresa publică a site-ului (linkuri absolute: sitemap, robots, previzualizări la distribuire).
 *  Static: din build (SITE_URL, setat de scripts/publish-pages.sh). Server: PUBLIC_SITE_URL din .env. */
export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Site-ul nu e lansat: paginile cer să nu fie indexate (NOINDEX=0 la lansare). */
export const noIndex = () => process.env.NEXT_PUBLIC_NOINDEX === "1" || process.env.NOINDEX === "1";
