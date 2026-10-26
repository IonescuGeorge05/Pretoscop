// Comparator calculat în browser (site-ul static nu are API). Aceleași componente ca backend/app/services/pricing.py.
import { formatLei } from "./format";
import type { Compare, Offer } from "./types";

const COMPONENTS: [keyof Offer["breakdown"], string][] = [
  ["price", "Preț"],
  ["shipping", "Transport"],
  ["warranty_months", "Garanție (luni)"],
  ["warranty_penalty", "Penalizare garanție"],
  ["final_price", "Preț final"],
  ["cost_per_warranty_month", "Cost / lună de garanție"],
];

export function compareOffers(a: Offer, b: Offer): Compare {
  const diffs = COMPONENTS.map(([component, label]) => ({
    component,
    label,
    a: a.breakdown[component],
    b: b.breakdown[component],
    diff: Math.round((b.breakdown[component] - a.breakdown[component]) * 100) / 100,
  }));
  const fa = a.breakdown.final_price;
  const fb = b.breakdown.final_price;
  if (fa === fb) {
    return { a, b, diffs, winner_offer_id: null, explanation: `${a.shop.name} și ${b.shop.name} au același preț final (${formatLei(fa)}).` };
  }
  const [w, l] = fa < fb ? [a, b] : [b, a];
  const parts = [
    `${w.shop.name} câștigă la preț final: ${formatLei(w.breakdown.final_price)} vs ${formatLei(l.breakdown.final_price)} ` +
      `(diferență ${formatLei(l.breakdown.final_price - w.breakdown.final_price)}).`,
  ];
  if (w.breakdown.price > l.breakdown.price) {
    const hidden: string[] = [];
    if (l.breakdown.shipping > w.breakdown.shipping) hidden.push(`transport ${formatLei(l.breakdown.shipping)} vs ${formatLei(w.breakdown.shipping)}`);
    if (l.breakdown.warranty_months < w.breakdown.warranty_months)
      hidden.push(
        `garanție ${l.breakdown.warranty_months} luni vs ${w.breakdown.warranty_months} luni (penalizare ${formatLei(l.breakdown.warranty_penalty)})`,
      );
    parts.push(
      `Deși prețul afișat la ${w.shop.name} e mai mare cu ${formatLei(w.breakdown.price - l.breakdown.price)}, ${l.shop.name} pierde din cauza costurilor ascunse: ${hidden.join("; ")}.`,
    );
  }
  return { a, b, diffs, winner_offer_id: w.id, explanation: parts.join(" ") };
}
