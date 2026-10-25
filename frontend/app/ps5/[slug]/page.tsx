import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import DemoBanner from "@/components/DemoBanner";
import FakeDiscountAlert from "@/components/FakeDiscountAlert";
import OffersSection from "@/components/OffersSection";
import PriceChart from "@/components/PriceChart";
import RecommendationCard from "@/components/RecommendationCard";
import { NotFound, getHistory, getProduct } from "@/lib/api";
import { formatLei, vsMsrp, withSource } from "@/lib/format";

type Props = { params: { slug: string }; searchParams: { source?: string; range?: string; granularity?: string } };

const RANGES = ["30d", "90d", "1y"];

async function load(slug: string, source?: string, range?: string, granularity?: string) {
  try {
    return await Promise.all([
      getProduct(slug, source),
      getHistory(
        slug,
        source,
        RANGES.includes(range ?? "") ? range : "90d",
        granularity === "week" ? "week" : "day",
      ),
    ]);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [p] = await load(params.slug, searchParams.source);
  const best = p.offers.find((o) => o.in_stock);
  const price = best ? ` de la ${formatLei(best.breakdown.final_price)}` : "";
  return {
    title: `${p.name} — preț${price}`,
    description: `Prețul final real pentru ${p.name} în magazinele din România${price}: transport, garanție, istoric de preț și recomandarea „${p.recommendation.label}”.`,
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const source = searchParams.source;
  const [product, history] = await load(params.slug, source, searchParams.range, searchParams.granularity);
  const rec = product.recommendation;
  const best = product.offers.find((o) => o.in_stock);

  return (
    <>
      <DemoBanner isDemo={product.is_demo} path={`/ps5/${product.slug}`} availableSources={product.available_sources} />
      <nav className="mb-2 text-xs text-muted">
        <Link href={withSource("/", source)} className="hover:text-ink">
          {product.family}
        </Link>{" "}
        / {product.name}
      </nav>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{product.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {product.edition === "disc" ? "Cu unitate disc" : "Digital (fără unitate disc)"} ·{" "}
        {product.storage_gb >= 1000 ? `${product.storage_gb / 1000} TB` : `${product.storage_gb} GB`}
        {product.model_code && ` · cod model ${product.model_code}`}
        {product.ean && ` · EAN ${product.ean}`}
      </p>
      {product.msrp_ron && (
        <p className="mt-2 text-sm">
          <span title={product.msrp_note ?? undefined} className="cursor-help">
            MSRP{product.msrp_verified ? "" : " (estimat)"}: <strong className="tabular-nums">{formatLei(product.msrp_ron)}</strong>
          </span>
          {best && (
            <span className="text-muted">
              {" "}
              · cel mai bun preț final: {formatLei(best.breakdown.final_price)} ({vsMsrp(best.breakdown.final_price, product.msrp_ron)})
            </span>
          )}
        </p>
      )}

      <div className="mt-6 space-y-6">
        <FakeDiscountAlert items={rec.fake_discounts} />
        <RecommendationCard rec={rec} />
        <PriceChart
          initial={history}
          slug={product.slug}
          source={source}
          msrp={product.msrp_ron}
          msrpVerified={product.msrp_verified}
        />
        <OffersSection offers={product.offers} />
      </div>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Refurbished și second hand</h2>
        <p className="max-w-3xl text-sm text-muted">
          Nu intră în comparația principală și nici în recomandare. <strong className="text-ink">Refurbished</strong> = console
          verificate și revândute de o firmă, cu garanție (Flip, pe grade estetice). <strong className="text-ink">Second hand</strong>{" "}
          = anunțuri de la persoane fizice (Publi24; OLX prin import manual), fără garanție: penalizarea de garanție (0,5%/lună lipsă) se vede în prețul
          final, iar transportul depinde de vânzător.
        </p>
        <OffersSection offers={product.refurbished} title="Refurbished (Flip)" />
        <OffersSection offers={product.secondhand} title="Second hand (Publi24, OLX)" />
      </section>

      {product.bundles.length > 0 && (
        <div className="mt-8">
          <OffersSection offers={product.bundles} title="Pachete (cu jocuri / accesorii) — excluse din comparația principală" />
        </div>
      )}
    </>
  );
}
