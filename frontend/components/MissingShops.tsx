import type { MissingShop } from "@/lib/types";

/** Ce magazine NU sunt în comparație și de ce, cu link să verifici singur. Mai bine spus clar decât lăsat să se creadă
 *  că am comparat tot. Linkurile sunt doar căutări pe site-ul magazinului: prețul de acolo nu e verificat de noi. */
export default function MissingShops({ shops }: { shops: MissingShop[] }) {
  if (!shops.length) return null;
  const names = shops.map((s) => s.name).join(", ");
  return (
    <aside className="rounded-3xl bg-soft p-5 text-sm leading-relaxed">
      <p className="text-muted">
        <strong className="text-ink">Nu includem încă {names}</strong>: {shops[0].reason}
        {shops.some((s) => s.reason !== shops[0].reason) ? " (sau oprit la cerere)" : ""}. Le-am cerut un feed de produse.
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted">Verifică și la:</span>
        {shops.map((s) => (
          <a
            key={s.name}
            href={s.search_url}
            target="_blank"
            rel="nofollow noopener"
            className="font-bold underline decoration-line underline-offset-4 hover:decoration-accent"
          >
            {s.name} ↗
          </a>
        ))}
        <span className="text-xs text-muted">(preț neverificat de noi)</span>
      </p>
    </aside>
  );
}
