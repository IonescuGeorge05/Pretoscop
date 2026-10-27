import { formatLeiShort } from "@/lib/format";
import type { Offer } from "@/lib/types";

/** Cea mai ieftină ofertă plauzibilă (ofertele sunt deja sortate: în stoc întâi, apoi după preț final). */
const cheapest = (offers: Offer[], direct = false) =>
  offers.find((o) => !o.is_bundle && !o.suspicious_price && !o.price_outlier && !(direct && o.is_marketplace)) ?? null;

const warrantyNote = (o: Offer) =>
  o.breakdown.warranty_months > 0
    ? `${o.breakdown.warranty_months} luni garanție${o.warranty_estimated ? " (estimat)" : ""}`
    : "fără garanție";

/** „Cât economisești”: cel mai bun preț nou vs refurbished vs second hand, cu ce pierzi în schimb. */
export default function SavingsCard({ offers, refurbished, secondhand }: { offers: Offer[]; refurbished: Offer[]; secondhand: Offer[] }) {
  const inStock = (list: Offer[]) => list.filter((o) => o.in_stock);
  const fresh = cheapest(inStock(offers), true) ?? cheapest(inStock(offers));
  // refurbished: arătăm și când e epuizat (Flip are des stoc zero), marcat ca atare
  const rows = [
    { label: "Nou", offer: fresh },
    { label: "Refurbished", offer: cheapest(inStock(refurbished)) ?? cheapest(refurbished) },
    { label: "Second hand", offer: cheapest(inStock(secondhand)) },
  ].filter((r): r is { label: string; offer: Offer } => r.offer !== null);
  if (!fresh || rows.length < 2) return null;
  const base = fresh.breakdown.final_price;

  return (
    <section aria-labelledby="savings-title">
      <h2 id="savings-title" className="font-display text-[28px] font-extrabold tracking-tight">
        Cât economisești dacă nu iei nou
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {rows.map(({ label, offer }) => {
          const diff = base - offer.breakdown.final_price;
          const isNew = offer === fresh;
          return (
            <div key={label} className={`rounded-3xl p-6 ${isNew ? "border-2 border-ink" : "bg-soft"}`}>
              <span className="text-sm font-bold">{label}</span>
              {!isNew && diff > 0 && (
                <span className="ml-2 rounded-full bg-green-100 px-2.5 py-0.5 text-[13px] font-bold text-green-900 dark:bg-green-950 dark:text-green-200">
                  −{formatLeiShort(diff)}
                </span>
              )}
              <div className="mt-2 font-display text-[32px] font-extrabold tabular-nums">{formatLeiShort(offer.breakdown.final_price)}</div>
              <p className="mt-1 text-sm text-muted">
                {offer.shop.name}
                {offer.grade ? ` · stare „${offer.grade}”` : ""}
                {offer.location ? ` · ${offer.location}` : ""} · {warrantyNote(offer)}
                {!offer.in_stock && " · momentan epuizat"}
                {!isNew && diff <= 0 && " · nu e mai ieftin decât nou"}
              </p>
            </div>
          );
        })}
      </div>
      {rows.some((r) => r.offer.condition === "used") && (
        <p className="mt-3 text-sm text-muted">
          La second hand transportul depinde de vânzător și nu ai garanție: verifică produsul la predare.
        </p>
      )}
    </section>
  );
}
