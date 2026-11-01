import { formatLeiShort } from "@/lib/format";
import type { Family, UnspecifiedListing } from "@/lib/types";

/** Ce n-a scris vânzătorul, din motivul matcher-ului. */
function missing(reason: string): string {
  if (reason.startsWith("ediție")) return "ediția (Digital sau cu disc)";
  if (reason.startsWith("generație")) return "modelul (original sau Slim)";
  if (reason.startsWith("Series")) return "modelul sau stocarea";
  if (reason.startsWith("stocare")) return "stocarea";
  return reason;
}

/** Anunțuri second hand la care vânzătorul n-a scris modelul exact (ex. „PS5 slim 1TB” — Digital sau cu disc?).
 *  Le arătăm separat, pe familii, ca să nu se piardă; prețul lor nu intră la niciun model. */
export default function UnspecifiedListings({ listings, families }: { listings: UnspecifiedListing[]; families: Family[] }) {
  if (!listings.length) return null;
  const groups = families
    .map((f) => ({ f, items: listings.filter((l) => l.family === f.family) }))
    .filter((g) => g.items.length);
  return (
    <section className="mt-14">
      <h2 className="font-display text-3xl font-extrabold tracking-tight">Anunțuri fără model exact</h2>
      <p className="mt-1 max-w-3xl text-muted">
        Vânzătorii n-au scris ediția sau stocarea (ex. „PS5 slim 1TB” poate fi Digital sau cu disc), așa că nu le punem la
        un model anume și nu intră în prețurile de mai sus. Întreabă vânzătorul înainte să cumperi. Ultimele 7 zile, fără
        prețurile suspect de mici.
      </p>
      {groups.map(({ f, items }) => (
        <div key={f.slug} className="mt-6">
          <h3 className="font-display text-xl font-extrabold tracking-tight">
            {f.family} <span className="text-base font-medium text-muted">· {items.length}</span>
          </h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => (
              <li key={l.url + l.title}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="nofollow noopener"
                  className="flex h-full flex-col rounded-2xl border border-line bg-card p-4 hover:border-accent"
                >
                  <span className="line-clamp-2 font-medium leading-snug">{l.title}</span>
                  <span className="mt-2 font-display text-xl font-extrabold tabular-nums">{formatLeiShort(l.price)}</span>
                  <span className="mt-1 text-xs text-muted">
                    {[l.shop, l.location, l.posted_label].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-1 text-xs text-muted">Nu scrie: {missing(l.reason)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
