import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import DemoBanner from "@/components/DemoBanner";
import FakeDiscountAlert from "@/components/FakeDiscountAlert";
import OffersSection from "@/components/OffersSection";
import PriceChart from "@/components/PriceChart";
import RecommendationCard from "@/components/RecommendationCard";
import SavingsCard from "@/components/SavingsCard";
import { NotFound, getHistory, getProduct, getProducts } from "@/lib/api";
import { IS_STATIC } from "@/lib/static";
import { formatLei, formatLeiShort, productHref, variantLabel, vsMsrp, withSource } from "@/lib/format";

type Props = { params: { family: string; slug: string }; searchParams: { source?: string; range?: string; granularity?: string } };

const RANGES = ["30d", "90d", "1y"];

// mod static: toate paginile de produs se generează la build din snapshot.
// Mod server: funcția NU trebuie să existe — altfel Next tratează pagina ca statică și cade la datele live (500).
export const generateStaticParams = IS_STATIC
  ? async () => {
      const { products } = await getProducts();
      return products.map((p) => ({ family: p.family_slug, slug: p.slug }));
    }
  : undefined;

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
  const [p] = await load(params.slug, IS_STATIC ? undefined : searchParams.source);
  const best = p.offers.find((o) => o.in_stock);
  const price = best ? ` de la ${formatLei(best.breakdown.final_price)}` : "";
  return {
    title: `${p.name} — preț${price}`,
    description: `Prețul final real pentru ${p.name} în magazinele din România${price}: transport, garanție, istoric de preț și recomandarea „${p.recommendation.label}”.`,
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  // site static: fără parametri în URL (intervalul se schimbă din grafic)
  const sp = IS_STATIC ? {} : searchParams;
  const source = sp.source;
  const [product, history] = await load(params.slug, source, sp.range, sp.granularity);
  if (product.family_slug !== params.family) notFound();
  const rec = product.recommendation;
  const best = product.offers.find((o) => o.in_stock);

  const overMsrp = !!(best && product.msrp_ron && best.breakdown.final_price > product.msrp_ron * 1.1);

  return (
    <>
      <DemoBanner isDemo={product.is_demo} path={productHref(product)} availableSources={product.available_sources} />
      <nav className="text-sm text-muted">
        <Link href={`${withSource("/", source)}#${product.family_slug}`} className="hover:text-ink">
          {product.family}
        </Link>{" "}
        › {variantLabel(product)}
      </nav>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-[46px]">{product.name}</h1>
      <p className="mt-1 text-muted">
        {variantLabel(product, true)}
        {product.model_code && ` · cod model ${product.model_code}`}
        {product.ean && ` · EAN ${product.ean}`}
      </p>

      <div className="mt-6 space-y-10">
        <FakeDiscountAlert items={rec.fake_discounts} />
        <section className="flex flex-wrap gap-5">
          <div className="min-w-0 flex-[999_1_520px]">
            <RecommendationCard rec={rec} overMsrp={overMsrp} />
          </div>
          <div className="flex flex-[1_1_300px] flex-col justify-center rounded-[28px] border border-line bg-card p-6 sm:p-8">
            {best ? (
              <>
                <span className="text-muted">Cel mai bun preț final</span>
                <span className="mt-1 font-display text-5xl font-extrabold tracking-tight tabular-nums">
                  {formatLeiShort(best.breakdown.final_price)}
                </span>
                <span className="text-muted">
                  la <strong className="text-ink">{best.shop.name}</strong>
                  {best.preorder ? " · precomandă" : ""} · {formatLei(best.breakdown.price)}
                  {best.breakdown.shipping > 0 ? ` + ${formatLei(best.breakdown.shipping)} transport` : " · transport gratuit"}
                </span>
                <a
                  href={IS_STATIC ? best.shop_url : best.out_url}
                  target="_blank"
                  rel="nofollow noopener sponsored"
                  className="mt-5 inline-flex min-h-[52px] items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-brand-ink hover:opacity-90"
                >
                  Mergi la {best.shop.name}
                </a>
              </>
            ) : (
              <span className="text-muted">Nicio ofertă nouă în stoc momentan.</span>
            )}
            {product.msrp_ron && (
              <span title={product.msrp_note ?? undefined} className="mt-3 cursor-help text-center text-sm text-muted">
                Prețul recomandat de producător{product.msrp_verified ? "" : " (estimat)"}: {formatLeiShort(product.msrp_ron)}
                {best && ` · ${vsMsrp(best.breakdown.final_price, product.msrp_ron)}`}
              </span>
            )}
          </div>
        </section>

        <SavingsCard offers={product.offers} refurbished={product.refurbished} secondhand={product.secondhand} />
        <OffersSection offers={product.offers} title="Unde îl găsești" />
        <PriceChart
          initial={history}
          slug={product.slug}
          source={source}
          msrp={product.msrp_ron}
          msrpVerified={product.msrp_verified}
        />

        <section className="space-y-4">
          <h2 className="font-display text-[28px] font-extrabold tracking-tight">Refurbished și second hand</h2>
          <p className="max-w-3xl text-muted">
            Nu intră în comparația principală și nici în recomandare. <strong className="text-ink">Refurbished</strong> = produse
            verificate și revândute de o firmă, cu garanție (Flip, pe grade estetice). <strong className="text-ink">Second hand</strong>{" "}
            = anunțuri de la persoane fizice (Publi24, OLX), fără garanție (marcate evident; prețul e cel din anunț), iar
            transportul depinde de vânzător.
          </p>
          <OffersSection offers={product.refurbished} title="Refurbished" />
          <OffersSection offers={product.secondhand} title="Second hand" locationFilter />
        </section>

        {product.bundles.length > 0 && (
          <OffersSection offers={product.bundles} title="Pachete (cu jocuri / accesorii) — excluse din comparația principală" />
        )}
      </div>
    </>
  );
}
