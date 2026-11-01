import { unstable_noStore as noStore } from "next/cache";

import { IS_STATIC } from "./static";

/** Adresa de contact a proiectului, din .env (SCRAPER_CONTACT -> BOT_CONTACT); exemplul implicit nu se afișează.
 *  Doar în componente server. */
export function projectContact(): string | null {
  if (!IS_STATIC) noStore(); // în containerul web adresa există doar la rulare, nu la build
  const c = process.env.BOT_CONTACT;
  return c && !c.endsWith("@example.com") ? c : null;
}
