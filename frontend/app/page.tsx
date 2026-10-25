import Link from "next/link";

import DemoBanner from "@/components/DemoBanner";
import VerdictBadge from "@/components/VerdictBadge";
import { getProducts } from "@/lib/api";
import { formatLei, vsMsrp, withSource } from "@/lib/format";

export default async function Home({ searchParams }: { searchParams: { source?: string } }) {
  const source = searchParams.source;
  const data = await getProducts(source);

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/" />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">PlayStation 5 — toate modelele</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Cel mai bun <strong>preț final real</strong> (preț + transport + penalizare pentru garanție mai scurtă) din
        magazinele urmărite, plus recomandarea noastră: cumperi acum sau aștepți?
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.products.map((p) => (
          <li key={p.slug}>
            <Link
              href={withSource(`/ps5/${p.slug}`, source)}
              className="flex h-full flex-col rounded-xl border border-line bg-card p-4 shadow-sm transition hover:border-brand"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-snug">{p.name}</h2>
              </div>
              <p className="mt-1 text-xs text-muted">
                {p.edition === "disc" ? "Cu unitate disc" : "Digital"} · {p.storage_gb >= 1000 ? `${p.storage_gb / 1000} TB` : `${p.storage_gb} GB`}
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
                    {p.refurbished_from && <>Refurbished de la <strong className="text-ink">{formatLei(p.refurbished_from)}</strong></>}
                    {p.refurbished_from && p.secondhand_from && " · "}
                    {p.secondhand_from && <>Second hand de la <strong className="text-ink">{formatLei(p.secondhand_from)}</strong></>}
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
    </>
  );
}
