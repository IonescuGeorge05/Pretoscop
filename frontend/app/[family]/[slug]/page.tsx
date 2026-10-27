import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import DemoBanner from "@/components/DemoBanner";
import FakeDiscountAlert from "@/components/FakeDiscountAlert";
import OfferTabs from "@/components/OfferTabs";
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
  const retired = product.lifecycle === "retired";
  const successor = retired && product.successor ? await getProduct(product.successor, source).catch(() => null) : null;
  const successorBest = successor?.offers.find((o) => o.in_stock);
  const refurb = product.refurbished.find((o) => !o.suspicious_price) ?? null;

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
        {retired && (
          <section className="rounded-[28px] bg-soft p-6 sm:p-8">
            <span className="text-sm font-bold uppercase tracking-wider text-muted">Nu se mai fabrică</span>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight">
              Îl găsești mai ales refurbished sau second hand.
            </h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
              Ce a mai rămas nou în magazine e de obicei mai scump decât modelul care l-a înlocuit, așa că nu dăm verdict
              „cumpără / așteaptă” pe stocul rămas.
            </p>
            {successor && (
              <Link
                href={productHref(successor, source)}
                className="mt-5 inline-flex min-h-12 flex-wrap items-center gap-x-2 rounded-full bg-card px-5 py-2 font-bold hover:ring-2 hover:ring-accent/40"
              >
                Înlocuit de {successor.name}
                {successorBest && <span className="font-medium text-muted">· nou de la {formatLeiShort(successorBest.breakdown.final_price)}</span>}
                <span aria-hidden>→</span>
              </Link>
            )}
          </section>
        )}

        <section className="flex flex-wrap gap-5">
          {!retired && (
            <div className="min-w-0 flex-[999_1_480px]">
              <RecommendationCard rec={rec} overMsrp={overMsrp} />
            </div>
          )}
          {/* nou și refurbished unul lângă altul: decizia completă dintr-o privire */}
          <div className={`grid min-w-0 gap-3 rounded-[28px] border border-line bg-card p-6 sm:grid-cols-2 sm:p-8 ${retired ? "flex-[1_1_100%]" : "flex-[1_1_380px]"}`}>
            <div className="flex flex-col">
              <span className="text-muted">{retired ? "Stoc nou rămas" : "Nou"}, cel mai bun preț final</span>
              {best ? (
                <>
                  <span className="mt-1 font-display text-[44px] font-extrabold leading-tight tracking-tight tabular-nums">
                    {formatLeiShort(best.breakdown.final_price)}
                  </span>
                  <span className="text-sm text-muted">
                    la <strong className="text-ink">{best.shop.name}</strong>
                    {best.preorder ? " · precomandă" : ""}
                    {best.breakdown.shipping > 0 ? ` · cu ${formatLei(best.breakdown.shipping)} transport` : " · transport gratuit"}
                  </span>
                  <a
                    href={IS_STATIC ? best.shop_url : best.out_url}
                    target="_blank"
                    rel="nofollow noopener sponsored"
                    className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-5 font-bold text-brand-ink hover:opacity-90"
                  >
                    Mergi la {best.shop.name}
                  </a>
                </>
              ) : (
                <span className="mt-2 text-muted">Nicio ofertă nouă în stoc momentan.</span>
              )}
            </div>
            <div className="flex flex-col rounded-2xl bg-soft p-4">
              <span className="text-muted">Refurbished, cu garanție</span>
              {refurb ? (
                <>
                  <span className="mt-1 font-display text-[34px] font-extrabold leading-tight tracking-tight tabular-nums">
                    {formatLeiShort(refurb.breakdown.final_price)}
                  </span>
                  <span className="text-sm text-muted">
                    {refurb.shop.name}
                    {refurb.grade ? ` · stare „${refurb.grade}”` : ""}
                    {!refurb.in_stock && " · momentan epuizat"}
                  </span>
                  {best && refurb.breakdown.final_price < best.breakdown.final_price && (
                    <span className="mt-2 self-start rounded-full bg-green-100 px-3 py-1 text-[13px] font-bold text-green-900 dark:bg-green-950 dark:text-green-200">
                      −{formatLeiShort(best.breakdown.final_price - refurb.breakdown.final_price)} față de nou
                    </span>
                  )}
                </>
              ) : (
                <span className="mt-2 text-sm text-muted">Nicio ofertă refurbished momentan.</span>
              )}
            </div>
            {product.msrp_ron && (
              <span title={product.msrp_note ?? undefined} className="cursor-help text-sm text-muted sm:col-span-2">
                Prețul recomandat de producător{product.msrp_verified ? "" : " (estimat)"}: {formatLeiShort(product.msrp_ron)}
                {best && ` · nou: ${vsMsrp(best.breakdown.final_price, product.msrp_ron)}`}
              </span>
            )}
          </div>
        </section>

        <OfferTabs offers={product.offers} refurbished={product.refurbished} secondhand={product.secondhand} retired={retired} />
        {!retired && <SavingsCard offers={product.offers} refurbished={product.refurbished} secondhand={product.secondhand} />}
        <PriceChart
          initial={history}
          slug={product.slug}
          source={source}
          msrp={product.msrp_ron}
          msrpVerified={product.msrp_verified}
        />

        {product.bundles.length > 0 && (
          <OffersSection offers={product.bundles} title="Pachete (cu jocuri / accesorii) — excluse din comparația principală" />
        )}
      </div>
    </>
  );
}
