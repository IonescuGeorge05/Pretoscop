import { formatLei } from "@/lib/format";
import type { Offer } from "@/lib/types";

/** Cea mai ieftină ofertă plauzibilă în stoc (ofertele sunt deja sortate după preț final). */
const cheapest = (offers: Offer[], direct = false) =>
  offers.find(
    (o) => o.in_stock && !o.is_bundle && !o.suspicious_price && !o.price_outlier && !(direct && o.is_marketplace),
  ) ?? null;

const warrantyNote = (o: Offer) =>
  o.breakdown.warranty_months > 0
    ? `${o.breakdown.warranty_months} luni garanție${o.warranty_estimated ? " (estimat)" : ""}`
    : "fără garanție";

/** „Cât economisești”: cel mai bun preț nou vs refurbished vs second hand, cu ce pierzi în schimb. */
export default function SavingsCard({ offers, refurbished, secondhand }: { offers: Offer[]; refurbished: Offer[]; secondhand: Offer[] }) {
  const fresh = cheapest(offers, true) ?? cheapest(offers);
  const rows = [
    { label: "Nou", offer: fresh },
    { label: "Refurbished", offer: cheapest(refurbished) },
    { label: "Second hand", offer: cheapest(secondhand) },
  ].filter((r): r is { label: string; offer: Offer } => r.offer !== null);
  if (!fresh || rows.length < 2) return null;
  const base = fresh.breakdown.final_price;

  return (
    <section aria-labelledby="savings-title" className="rounded-xl border border-line bg-card p-4">
      <h2 id="savings-title" className="text-lg font-semibold">
        Cât economisești
      </h2>
      <p className="mt-1 text-sm text-muted">Cel mai bun preț final în stoc, pe fiecare stare a produsului.</p>
      <ul className="mt-3 divide-y divide-line">
        {rows.map(({ label, offer }) => {
          const diff = base - offer.breakdown.final_price;
          return (
            <li key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <div>
                <strong>{label}</strong>{" "}
                <span className="text-muted">
                  · {offer.shop.name}
                  {offer.grade ? ` · ${offer.grade}` : ""} · {warrantyNote(offer)}
                </span>
              </div>
              <div className="tabular-nums">
                <strong>{formatLei(offer.breakdown.final_price)}</strong>
                {offer !== fresh && (
                  <span className={diff > 0 ? "ml-2 text-emerald-700 dark:text-emerald-400" : "ml-2 text-muted"}>
                    {diff > 0
                      ? `−${formatLei(diff)} (−${Math.round((diff / base) * 100)}%)`
                      : "nu e mai ieftin decât nou"}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.some((r) => r.offer.condition === "used") && (
        <p className="mt-2 text-xs text-muted">
          La second hand transportul depinde de vânzător și nu ai garanție: verifică produsul la predare.
        </p>
      )}
    </section>
  );
}
