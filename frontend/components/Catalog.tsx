"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import VerdictBadge from "@/components/VerdictBadge";
import { formatLei, formatLeiShort, productHref, variantLabel } from "@/lib/format";
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
  { value: "NEUTRAL", label: "Preț obișnuit" },
];

const price = (p: ProductSummary) => p.best_offer?.breakdown.final_price ?? Infinity;
const msrpRatio = (p: ProductSummary) => (p.best_offer && p.msrp_ron ? price(p) / p.msrp_ron : Infinity);

function FamilyIcon({ slug }: { slug: string }) {
  return slug.startsWith("iphone") ? (
    <svg width="26" height="30" viewBox="0 0 26 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="4" y="2" width="18" height="28" rx="4" />
      <path d="M10 6h6" />
    </svg>
  ) : (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M10 12h12a6 6 0 016 6v1a4 4 0 01-7 2.6L19 19h-6l-2 2.6A4 4 0 014 19v-1a6 6 0 016-6z" />
      <path d="M10 15v4M8 17h4" />
      <circle cx="21" cy="16" r="1" />
      <circle cx="23" cy="18.5" r="1" />
    </svg>
  );
}

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
  const field = "rounded-full border border-line bg-card px-4 py-2.5 text-sm";

  return (
    <>
      <section className="flex flex-wrap items-center gap-8 rounded-[28px] bg-warm px-6 py-10 sm:px-10 sm:py-12">
        <div className="min-w-0 flex-[999_1_480px]">
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-[56px]">
            Cumperi acum
            <br />
            sau mai aștepți?
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            Comparăm prețul final — cu transport și garanție — din magazinele din România și îți spunem sincer dacă e
            un preț bun.
          </p>
          <form
            role="search"
            onSubmit={(e) => e.preventDefault()}
            className="mt-7 flex max-w-xl gap-2 rounded-full bg-card p-1.5 shadow-[0_1px_2px_rgba(28,25,23,0.06),0_8px_24px_rgba(194,65,12,0.08)]"
          >
            <label className="flex min-w-0 flex-1 items-center gap-2.5 pl-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none text-muted" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <span className="sr-only">Ce cauți?</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="PS5 Slim, iPhone 18 Pro 512…"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              />
            </label>
            <button type="submit" className="min-h-12 rounded-full bg-brand px-6 text-[15px] font-bold text-brand-ink">
              Caută
            </button>
          </form>
        </div>
        <div className="flex flex-[1_1_280px] flex-col gap-3">
          {families.map((f) => {
            const fam = products.filter((p) => p.family === f.family);
            const from = Math.min(...fam.map(price));
            return (
              <a key={f.slug} href={`#${f.slug}`} className="flex items-center gap-4 rounded-[20px] bg-card p-4 hover:ring-2 hover:ring-accent/40">
                <span className="inline-flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-warm text-brand">
                  <FamilyIcon slug={f.slug} />
                </span>
                <span>
                  <strong className="block text-[17px]">{f.title}</strong>
                  <span className="text-sm text-muted">
                    {fam.length} modele{from !== Infinity ? ` · de la ${formatLeiShort(from)}` : ""}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-2">
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
        <label className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[rgb(var(--brand))]" />
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
          <section key={fam.slug} id={fam.slug} className="mt-12 scroll-mt-6">
            <h2 className="font-display text-3xl font-extrabold tracking-tight">{fam.title}</h2>
            <p className="mt-1 text-muted">{fam.description}</p>
            <ProductGrid products={products.filter((p) => p.family === fam.family)} source={source} />
          </section>
        ))
      )}
    </>
  );
}

/** Eticheta de sus a cardului: cât e prețul față de MSRP, verde doar când e sub. */
function MsrpPill({ p }: { p: ProductSummary }) {
  if (!p.best_offer || !p.msrp_ron) return null;
  const pct = Math.round((p.best_offer.breakdown.final_price / p.msrp_ron - 1) * 100);
  const below = pct < 0;
  return (
    <span
      title={`MSRP${p.msrp_verified ? "" : " (estimat)"}: ${formatLei(p.msrp_ron)}`}
      className={`self-start rounded-full px-3 py-1.5 text-[13px] font-bold ${
        below
          ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
          : pct <= 10
            ? "bg-soft text-ink"
            : "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200"
      }`}
    >
      {below ? `${-pct}% sub MSRP` : pct === 0 ? "la MSRP" : `${pct}% peste MSRP`}
    </span>
  );
}

function ProductGrid({ products, source }: { products: ProductSummary[]; source?: string }) {
  if (!products.length) return <p className="mt-4 text-muted">Niciun produs nu corespunde filtrelor.</p>;
  return (
    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={productHref(p, source)}
            className="flex h-full flex-col rounded-3xl border border-line bg-card p-5 transition hover:border-accent hover:shadow-[0_8px_24px_rgba(194,65,12,0.08)]"
          >
            <MsrpPill p={p} />
            <span className="mt-4 text-base font-bold leading-snug">{p.name}</span>
            <span className="text-sm text-muted">
              {variantLabel(p)}
              {p.model_code ? ` · ${p.model_code}` : ""}
            </span>
            <div className="mt-4 flex-1">
              {p.best_offer ? (
                <>
                  <p className="font-display text-[34px] font-extrabold leading-tight tracking-tight tabular-nums">
                    {formatLeiShort(p.best_offer.breakdown.final_price)}
                  </p>
                  <p className="text-sm text-muted">
                    la <strong className="text-ink">{p.best_offer.shop.name}</strong>, cu tot cu transport · {p.offers_count}{" "}
                    {p.offers_count === 1 ? "ofertă" : "oferte"}
                  </p>
                </>
              ) : (
                <p className="text-muted">Nicio ofertă în stoc momentan.</p>
              )}
              {(p.refurbished_from || p.secondhand_from) && (
                <p className="mt-3 text-sm text-muted">
                  {p.refurbished_from && (
                    <>
                      Refurbished de la <strong className="text-ink">{formatLeiShort(p.refurbished_from)}</strong>
                    </>
                  )}
                  {p.refurbished_from && p.secondhand_from && " · "}
                  {p.secondhand_from && (
                    <>
                      Second hand de la <strong className="text-ink">{formatLeiShort(p.secondhand_from)}</strong>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="mt-5">
              <VerdictBadge verdict={p.recommendation.verdict} label={p.recommendation.label} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
