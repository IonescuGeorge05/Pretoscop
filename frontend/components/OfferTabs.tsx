"use client";

import { useEffect, useState } from "react";

import OffersSection from "@/components/OffersSection";
import type { Offer } from "@/lib/types";

type Key = "new" | "refurbished" | "secondhand";

/** Ofertele pe file: Nou · Refurbished · Second hand. `#second-hand` în adresă deschide direct fila second hand. */
export default function OfferTabs({
  offers,
  refurbished,
  secondhand,
  retired = false,
}: {
  offers: Offer[];
  refurbished: Offer[];
  secondhand: Offer[];
  retired?: boolean;
}) {
  const tabs: { key: Key; label: string; list: Offer[] }[] = [
    { key: "new", label: retired ? "Stoc nou rămas" : "Nou", list: offers },
    { key: "refurbished", label: "Refurbished", list: refurbished },
    { key: "secondhand", label: "Second hand", list: secondhand },
  ];
  // model retras: în prim-plan sunt refurbished / second hand, nu stocul rămas
  const firstWithOffers = (keys: Key[]) => keys.find((k) => tabs.find((t) => t.key === k)!.list.length) ?? keys[0];
  const [tab, setTab] = useState<Key>(retired ? firstWithOffers(["refurbished", "secondhand", "new"]) : "new");

  useEffect(() => {
    if (window.location.hash === "#second-hand") setTab(firstWithOffers(["refurbished", "secondhand", "new"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = tabs.find((t) => t.key === tab)!;
  return (
    <section id="second-hand" aria-labelledby="offer-tabs-title" className="scroll-mt-6">
      <h2 id="offer-tabs-title" className="font-display text-[28px] font-extrabold tracking-tight">
        Unde îl găsești
      </h2>
      <div role="tablist" aria-label="Stare" className="mt-3 inline-flex flex-wrap rounded-full bg-soft p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-11 rounded-full px-4 text-[15px] font-bold transition ${tab === t.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {t.label} <span className="font-medium text-muted">({t.list.length})</span>
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        {tab === "new" &&
          (retired
            ? "Modelul nu se mai fabrică: ce a rămas nou în magazine e de obicei mai scump decât înlocuitorul. Nu dăm verdict pe stocul rămas."
            : "Sortate după preț final (cu transport). Ofertele de pe marketplace și pachetele nu intră în minimul pieței.")}
        {tab === "refurbished" && "Verificate și revândute de o firmă, cu garanție, pe grade estetice."}
        {tab === "secondhand" &&
          "Anunțuri de la persoane fizice, fără garanție; prețul e cel din anunț, transportul depinde de vânzător."}
      </p>
      <div className="mt-2">
        <OffersSection offers={current.list} title="" locationFilter={tab === "secondhand"} />
      </div>
    </section>
  );
}
