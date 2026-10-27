"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import VerdictBadge from "@/components/VerdictBadge";
import { formatLei, formatLeiShort, productHref, variantLabel } from "@/lib/format";
import type { Family, ProductSummary, Verdict } from "@/lib/types";

export type Tab = "new" | "used";

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

const isCurrent = (p: ProductSummary) => p.lifecycle !== "retired";
const newPrice = (p: ProductSummary) => p.best_offer?.breakdown.final_price ?? Infinity;
// fila „second hand și refurbished”: cel mai mic dintre refurbished în stoc și second hand
const usedPrice = (p: ProductSummary) => Math.min(p.refurbished_from ?? Infinity, p.secondhand_from ?? Infinity);
const msrpRatio = (p: ProductSummary, tab: Tab) => {
  const v = tab === "new" ? newPrice(p) : usedPrice(p);
  return v !== Infinity && p.msrp_ron ? v / p.msrp_ron : Infinity;
};

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

/** Lista de produse: fila „Nou” (modelele în fabricație) și fila „Second hand și refurbished” (toate modelele).
 *  Căutare, filtre și sortare în browser (merge și pe site-ul static). */
export default function Catalog({
  families,
  products,
  source,
  initialTab = "new",
}: {
  families: Family[];
  products: ProductSummary[];
  source?: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("");
  const [verdict, setVerdict] = useState<Verdict | "">("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<Sort>("default");

  const inTab = useMemo(() => (tab === "new" ? products.filter(isCurrent) : products), [products, tab]);
  const price = tab === "new" ? newPrice : usedPrice;

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = inTab.filter((p) => {
      const hay = `${p.name} ${variantLabel(p)} ${p.model_code ?? ""} ${p.family}`.toLowerCase();
      return (
        words.every((w) => hay.includes(w)) &&
        (!family || p.family_slug === family) &&
        (tab !== "new" || !verdict || p.recommendation.verdict === verdict) &&
        (!inStock || price(p) !== Infinity)
      );
    });
    if (sort === "price_asc") list.sort((a, b) => price(a) - price(b));
    if (sort === "price_desc") list.sort((a, b) => (price(b) === Infinity ? -1 : price(a) === Infinity ? 1 : price(b) - price(a)));
    if (sort === "vs_msrp") list.sort((a, b) => msrpRatio(a, tab) - msrpRatio(b, tab));
    if (tab === "used" && sort === "default") list.sort((a, b) => Number(!isCurrent(a)) - Number(!isCurrent(b)));
    return list;
  }, [inTab, q, family, verdict, inStock, sort, tab, price]);

  const filtering = q || family || (tab === "new" && verdict) || inStock || sort !== "default";
  const field = "rounded-full border border-line bg-card px-4 py-2.5 text-sm";

  return (
    <>
      <section className="flex flex-wrap items-center gap-8 rounded-[28px] bg-warm px-6 py-10 sm:px-10 sm:py-12">
        <div className="min-w-0 flex-[999_1_480px]">
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-[56px]">
            {tab === "new" ? (
              <>
                Cumperi acum
                <br />
                sau mai aștepți?
              </>
            ) : (
              <>
                Mai ieftin,
                <br />
                la mâna a doua.
              </>
            )}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            {tab === "new"
              ? "Comparăm prețul final — cu transport și garanție — din magazinele din România și îți spunem sincer dacă e un preț bun."
              : "Refurbished (verificat de o firmă, cu garanție) și second hand (de la persoane fizice), pentru toate modelele — inclusiv cele care nu se mai fabrică."}
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
            const fam = inTab.filter((p) => p.family === f.family);
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

      {/* filele: „Nou” = modelele în fabricație; „Second hand și refurbished” = toate modelele (are și pagină proprie) */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Stare produs" className="inline-flex rounded-full bg-soft p-1">
          {(
            [
              ["new", "Nou"],
              ["used", "Second hand și refurbished"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-full px-5 text-[15px] font-bold transition ${tab === key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "used" && initialTab === "new" && (
          <Link href="/second-hand" className="text-sm font-medium underline">
            Deschide ca pagină separată
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Familie" className={field}>
          <option value="">Toate produsele</option>
          {families.map((f) => (
            <option key={f.slug} value={f.slug}>
              {f.title}
            </option>
          ))}
        </select>
        {tab === "new" && (
          <select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict | "")} aria-label="Recomandare" className={field}>
            {VERDICTS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortare" className={field}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[rgb(var(--brand))]" />
          {tab === "new" ? "doar în stoc" : "doar cu oferte acum"}
        </label>
      </div>

      {filtering ? (
        <section className="mt-6">
          <p className="text-sm text-muted">
            {filtered.length} {filtered.length === 1 ? "produs" : "produse"}
          </p>
          <ProductGrid products={filtered} source={source} tab={tab} />
        </section>
      ) : (
        families.map((fam) => (
          <section key={fam.slug} id={fam.slug} className="mt-12 scroll-mt-6">
            <h2 className="font-display text-3xl font-extrabold tracking-tight">{fam.title}</h2>
            <p className="mt-1 text-muted">{fam.description}</p>
            <ProductGrid products={filtered.filter((p) => p.family === fam.family)} source={source} tab={tab} />
          </section>
        ))
      )}
    </>
  );
}

/** Eticheta de sus a cardului: cât e prețul față de MSRP, verde doar când e sub. */
function MsrpPill({ p, value }: { p: ProductSummary; value: number | null }) {
  if (value === null || !p.msrp_ron) return null;
  const pct = Math.round((value / p.msrp_ron - 1) * 100);
  const below = pct < 0;
  return (
    <span
      title={`MSRP${p.msrp_verified ? "" : " (estimat)"}: ${formatLei(p.msrp_ron)}`}
      className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${
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

function PriceCell({ label, value, note, strong }: { label: string; value: number | null | undefined; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${strong ? "bg-warm" : "bg-soft"}`}>
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{label}</div>
      {value != null ? (
        <div className={`font-display font-extrabold tabular-nums ${strong ? "text-[26px]" : "text-[22px]"}`}>{formatLeiShort(value)}</div>
      ) : (
        <div className="py-1 text-sm text-muted">—</div>
      )}
      {note && <div className="text-xs text-muted">{note}</div>}
    </div>
  );
}

function ProductGrid({ products, source, tab }: { products: ProductSummary[]; source?: string; tab: Tab }) {
  if (!products.length) return <p className="mt-4 text-muted">Niciun produs nu corespunde filtrelor.</p>;
  return (
    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => {
        const best = p.best_offer?.breakdown.final_price ?? null;
        const refurbNote = p.refurbished_from
          ? "cu garanție"
          : p.refurbished_last
            ? `epuizat · ultimul ${formatLeiShort(p.refurbished_last)}`
            : undefined;
        return (
          <li key={p.slug}>
            <Link
              href={`${productHref(p, source)}${tab === "used" ? "#second-hand" : ""}`}
              className="flex h-full flex-col rounded-3xl border border-line bg-card p-5 transition hover:border-accent hover:shadow-[0_8px_24px_rgba(194,65,12,0.08)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                {tab === "new" ? (
                  <MsrpPill p={p} value={best} />
                ) : !isCurrent(p) ? (
                  <span className="rounded-full bg-soft px-3 py-1.5 text-[13px] font-bold text-muted">Nu se mai fabrică</span>
                ) : (
                  <MsrpPill p={p} value={usedPrice(p) === Infinity ? null : usedPrice(p)} />
                )}
              </div>
              <span className="mt-4 text-base font-bold leading-snug">{p.name}</span>
              <span className="text-sm text-muted">
                {variantLabel(p)}
                {p.model_code ? ` · ${p.model_code}` : ""}
              </span>

              {tab === "new" ? (
                <>
                  {/* nou și refurbished unul lângă altul: la modelele actuale refurbished e o alternativă reală */}
                  <div className="mt-4 grid flex-1 grid-cols-2 content-start gap-2">
                    <PriceCell
                      label="Nou"
                      value={best}
                      strong
                      note={p.best_offer ? `${p.best_offer.shop.name}${p.best_offer.preorder ? " · precomandă" : ""}` : "fără stoc"}
                    />
                    <PriceCell label="Refurbished" value={p.refurbished_from} note={refurbNote} />
                  </div>
                  {p.secondhand_from && (
                    <p className="mt-2 text-sm text-muted">
                      Second hand de la <strong className="text-ink">{formatLeiShort(p.secondhand_from)}</strong>
                    </p>
                  )}
                  <div className="mt-4">
                    <VerdictBadge verdict={p.recommendation.verdict} label={p.recommendation.label} />
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 grid flex-1 grid-cols-2 content-start gap-2">
                    <PriceCell label="Refurbished" value={p.refurbished_from} note={refurbNote ?? "nicio ofertă"} strong />
                    <PriceCell
                      label="Second hand"
                      value={p.secondhand_from}
                      note={p.secondhand_count ? `${p.secondhand_count} ${p.secondhand_count === 1 ? "anunț" : "anunțuri"}` : "niciun anunț"}
                    />
                  </div>
                  {!!p.secondhand_cities?.length && (
                    <p className="mt-2 text-sm text-muted">În {p.secondhand_cities.join(", ")}</p>
                  )}
                  {best !== null && (
                    <p className="mt-2 text-sm text-muted">
                      {isCurrent(p) ? "Nou" : "Stoc nou rămas"} de la <strong className="text-ink">{formatLeiShort(best)}</strong>
                    </p>
                  )}
                </>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
