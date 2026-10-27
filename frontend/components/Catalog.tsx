"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import VerdictBadge from "@/components/VerdictBadge";
import { formatLei, productHref, variantLabel, vsMsrp } from "@/lib/format";
import type { Family, ProductSummary, Verdict } from "@/lib/types";

const SORTS = {
  default: "Recomandat",
  price_asc: "Preț crescător",
  price_desc: "Preț descrescător",
  vs_msrp: "Cel mai sub MSRP",
} as const;
type Sort = keyof typeof SORTS;

const VERDICTS: { value: Verdict | ""; label: string }[] = [
  { value: "", label: "Orice recomandare" },
  { value: "BUY_NOW", label: "Cumpără acum" },
  { value: "UPCOMING_SALE", label: "Urmează reduceri" },
  { value: "WAIT", label: "Așteaptă" },
  { value: "NEUTRAL", label: "Neutru" },
];

const price = (p: ProductSummary) => p.best_offer?.breakdown.final_price ?? Infinity;
const msrpRatio = (p: ProductSummary) => (p.best_offer && p.msrp_ron ? price(p) / p.msrp_ron : Infinity);

/** Lista de produse cu căutare, filtre și sortare (totul în browser, merge și pe site-ul static). */
export default function Catalog({ families, products, source }: { families: Family[]; products: ProductSummary[]; source?: string }) {
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("");
  const [verdict, setVerdict] = useState<Verdict | "">("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<Sort>("default");

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = products.filter((p) => {
      const hay = `${p.name} ${variantLabel(p)} ${p.model_code ?? ""} ${p.family}`.toLowerCase();
      return (
        words.every((w) => hay.includes(w)) &&
        (!family || p.family_slug === family) &&
        (!verdict || p.recommendation.verdict === verdict) &&
        (!inStock || p.best_offer)
      );
    });
    if (sort === "price_asc") list.sort((a, b) => price(a) - price(b));
    if (sort === "price_desc") list.sort((a, b) => (price(b) === Infinity ? -1 : price(a) === Infinity ? 1 : price(b) - price(a)));
    if (sort === "vs_msrp") list.sort((a, b) => msrpRatio(a) - msrpRatio(b));
    return list;
  }, [products, q, family, verdict, inStock, sort]);

  const filtering = q || family || verdict || inStock || sort !== "default";
  const field = "rounded-lg border border-line bg-card px-3 py-2 text-sm";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Caută: pro 2tb, digital, 512…"
          aria-label="Caută produs"
          className={`${field} min-w-0 flex-1 basis-56`}
        />
        <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Familie" className={field}>
          <option value="">Toate produsele</option>
          {families.map((f) => (
            <option key={f.slug} value={f.slug}>
              {f.title}
            </option>
          ))}
        </select>
        <select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict | "")} aria-label="Recomandare" className={field}>
          {VERDICTS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortare" className={field}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
          doar în stoc
        </label>
      </div>

      {filtering ? (
        <section className="mt-6">
          <p className="text-sm text-muted">
            {filtered.length} {filtered.length === 1 ? "produs" : "produse"}
          </p>
          <ProductGrid products={filtered} source={source} />
        </section>
      ) : (
        families.map((fam) => (
          <section key={fam.slug} id={fam.slug} className="mt-8">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{fam.title}</h1>
            <p className="mt-1 text-sm text-muted">{fam.description}</p>
            <ProductGrid products={products.filter((p) => p.family === fam.family)} source={source} />
          </section>
        ))
      )}
    </>
  );
}

function ProductGrid({ products, source }: { products: ProductSummary[]; source?: string }) {
  if (!products.length) return <p className="mt-4 text-sm text-muted">Niciun produs nu corespunde filtrelor.</p>;
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={productHref(p, source)}
            className="flex h-full flex-col rounded-xl border border-line bg-card p-4 shadow-sm transition hover:border-brand"
          >
            <h2 className="font-semibold leading-snug">{p.name}</h2>
            <p className="mt-1 text-xs text-muted">
              {variantLabel(p)}
              {p.model_code ? ` · ${p.model_code}` : ""}
            </p>
            <div className="mt-4 flex-1">
              {p.best_offer ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{formatLei(p.best_offer.breakdown.final_price)}</p>
                  <p className="text-xs text-muted">
                    preț final la <strong className="text-ink">{p.best_offer.shop.name}</strong> · {p.offers_count}{" "}
                    {p.offers_count === 1 ? "ofertă" : "oferte"}
                  </p>
                  {p.msrp_ron && (
                    <p className="mt-1 text-xs text-muted">
                      MSRP{p.msrp_verified ? "" : " (estimat)"} {formatLei(p.msrp_ron)} ·{" "}
                      {vsMsrp(p.best_offer.breakdown.final_price, p.msrp_ron)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">Nicio ofertă în stoc momentan.</p>
              )}
              {(p.refurbished_from || p.secondhand_from) && (
                <p className="mt-2 text-xs text-muted">
                  {p.refurbished_from && (
                    <>
                      Refurbished de la <strong className="text-ink">{formatLei(p.refurbished_from)}</strong>
                    </>
                  )}
                  {p.refurbished_from && p.secondhand_from && " · "}
                  {p.secondhand_from && (
                    <>
                      Second hand de la <strong className="text-ink">{formatLei(p.secondhand_from)}</strong>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="mt-4">
              <VerdictBadge verdict={p.recommendation.verdict} label={p.recommendation.label} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
