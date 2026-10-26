import Link from "next/link";

import DemoBanner from "@/components/DemoBanner";
import VerdictBadge from "@/components/VerdictBadge";
import { getProducts } from "@/lib/api";
import { formatLei, productHref, variantLabel, vsMsrp } from "@/lib/format";
import { IS_STATIC } from "@/lib/static";

export default async function Home({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source; // site static: fără parametri în URL
  const data = await getProducts(source);

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/" />
      <p className="max-w-2xl text-sm text-muted">
        Cel mai bun <strong className="text-ink">preț final real</strong> (preț + transport + penalizare pentru garanție
        mai scurtă) din toate magazinele urmărite, plus recomandarea noastră: cumperi acum sau aștepți?
      </p>

      {data.families.map((fam) => (
        <section key={fam.slug} id={fam.slug} className="mt-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{fam.title}</h1>
          <p className="mt-1 text-sm text-muted">{fam.description}</p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.products
              .filter((p) => p.family === fam.family)
              .map((p) => (
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
        </section>
      ))}
    </>
  );
}
