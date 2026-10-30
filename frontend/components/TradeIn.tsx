"use client";

import { useState } from "react";

import { formatLeiShort } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";

/** „Cât te costă de fapt schimbul”: prețul nou de aici minus cât cer alții pe modelul tău vechi (mediana anunțurilor
 *  second hand active). E preț cerut, nu preț de vânzare garantat — o spunem lângă cifră. */
export default function TradeIn({ newPrice, candidates }: { newPrice: number; candidates: ProductSummary[] }) {
  const usable = candidates.filter((p) => p.secondhand_median);
  const [slug, setSlug] = useState(usable[0]?.slug ?? "");
  if (!usable.length) return null;
  const old = usable.find((p) => p.slug === slug) ?? usable[0];
  const value = old.secondhand_median!;
  const cost = newPrice - value;

  return (
    <section className="rounded-[28px] bg-warm p-6">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">Cât te costă de fapt, dacă îl vinzi pe cel vechi</h2>
      <label className="mt-4 block text-sm text-muted" htmlFor="tradein-old">
        Ce ai acum?
      </label>
      <select
        id="tradein-old"
        value={old.slug}
        onChange={(e) => setSlug(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-full border border-line bg-card px-4 text-[15px]"
      >
        {usable.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[15px]">
        <dt className="text-muted">Nou, aici</dt>
        <dd className="text-right tabular-nums">{formatLeiShort(newPrice)}</dd>
        <dt className="text-muted">
          Cât cer alții pe al tău <span className="text-xs">({old.secondhand_count} anunțuri, mediana)</span>
        </dt>
        <dd className="text-right tabular-nums">−{formatLeiShort(value)}</dd>
        <dt className="border-t border-line pt-2 font-bold">Diferența reală</dt>
        <dd className="border-t border-line pt-2 text-right font-display text-2xl font-extrabold tabular-nums">
          {cost > 0 ? formatLeiShort(cost) : "0 lei"}
        </dd>
      </dl>
      <p className="mt-3 text-xs text-muted">
        Calculat din prețurile cerute în anunțurile second hand de acum; la vânzare rapidă iei de obicei ceva mai puțin.
      </p>
    </section>
  );
}
