// Mod static (GitHub Pages): fără server, datele vin din fișiere JSON publicate lângă pagini.
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL public al unui fișier din snapshot, ex. dataUrl("history/ps5-pro-2tb/90d-day.json") */
export const dataUrl = (rel: string) => `${BASE_PATH}/data/${rel}`;
